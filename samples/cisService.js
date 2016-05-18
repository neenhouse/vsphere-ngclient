"use strict";

import fs from "fs";
import https from "https";
import path from "path";
import read from "read";
import url from "url";
import vsphere from "../dist/vsphere";
import xmldom from "xmldom";

function appendToken(stsService, samlToken, {body, outgoing}) {
   if (outgoing) {
      let header = body.createElementNS(
            "http://schemas.xmlsoap.org/soap/envelope/", "Header");
      let securityElement = stsService.serializeObject(
         stsService.wsse.SecurityHeaderType({
            Timestamp: stsService.wsu.TimestampType({
               Created: stsService.wsu.AttributedDateTime({
                  value: new Date().toISOString()
               }),
               Expires: stsService.wsu.AttributedDateTime({
                  value: new Date(Date.now() + 1000 * 60 * 10).toISOString()
               })
            })
         }), "Security");
      securityElement.appendChild(samlToken);
      header.appendChild(securityElement);
      body.firstChild.insertBefore(header, body.firstChild.firstChild);
   }
}

async function issueToken(stsService, username, password) {
   let samlToken;
   let {addHandler, serializeObject, stsPort, wst13, wsse, wsu} = stsService;
   let requestSecurityToken = wst13.RequestSecurityTokenType({
      Delegatable: true,
      KeyType: wst13.KeyTypeEnum
            ["http://docs.oasis-open.org/ws-sx/ws-trust/200512/Bearer"],
      Lifetime: wst13.LifetimeType({
         Created: wsu.AttributedDateTime({
            value: new Date().toISOString()
         }),
         Expires: wsu.AttributedDateTime({
            value: new Date(Date.now() + 1000 * 60 * 10).toISOString()
         })
      }),
      Renewing: wst13.RenewingType({
         Allow: false,
         OK: false
      }),
      RequestType: wst13.RequestTypeOpenEnum
            ["http://docs.oasis-open.org/ws-sx/ws-trust/200512/Issue"],
      SignatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
      TokenType: "urn:oasis:names:tc:SAML:2.0:assertion"
   });
   addHandler(({body, outgoing}) => {
      if (outgoing) {
         let securityHeader = wsse.SecurityHeaderType({
            Timestamp: wsu.TimestampType({
               Created: wsu.AttributedDateTime({
                  value: new Date().toISOString()
               }),
               Expires: wsu.AttributedDateTime({
                  value: new Date(Date.now() + 1000 * 60 * 10).toISOString()
               })
            }),
            UsernameToken: wsse.UsernameTokenType({
               Username: wsse.AttributedString({
                  value: username
               }),
               Password: wsse.PasswordString({
                  value: password
               })
            })
         });
         let header = body.createElementNS(
               "http://schemas.xmlsoap.org/soap/envelope/", "Header");
         header.appendChild(serializeObject(securityHeader, "Security"));
         body.firstChild.insertBefore(header, body.firstChild.firstChild);
      }
   });
   addHandler(({body, outgoing}) => {
      if (!outgoing) {
         samlToken = body.getElementsByTagNameNS(
               "urn:oasis:names:tc:SAML:2.0:assertion", "Assertion")[0];
      }
   });
   await stsPort.issue(requestSecurityToken);
   return samlToken;
}

async function retrieveTargetObjects(vimService) {
   let {serviceContent: {
      propertyCollector,
      rootFolder,
      viewManager
   }, vim, vimPort} = vimService;
   let containerView = await vimPort.createContainerView(viewManager,
         rootFolder, ["ClusterComputeResource"], true);
   let targetObjects = await vimPort.retrievePropertiesEx(propertyCollector, [
      vim.PropertyFilterSpec({
         objectSet: vim.ObjectSpec({
            obj: containerView,
            skip: true,
            selectSet: vim.TraversalSpec({
               path: "view",
               type: "ContainerView"
            })
         }),
         propSet: vim.PropertySpec({
            type: "ClusterComputeResource",
            pathSet: ["datastore", "resourcePool"]
         })
      })
   ], vim.RetrieveOptions());
   let {objects:[{
      obj: cluster,
      propSet: [{
         val: [datastore]
      }, {
         val: resourcePool
      }]
   }]} = targetObjects;
   return {
      cluster,
      datastore,
      resourcePool
   };
}

async function completeTask(vimService, task) {
   let {serviceContent: {
      propertyCollector
   }, vim, vimPort} = vimService;
   let filter = await vimPort.createFilter(propertyCollector,
      vim.PropertyFilterSpec({
         objectSet: vim.ObjectSpec({
            obj: task,
            skip: false
         }),
         propSet: vim.PropertySpec({
            type: task.type,
            pathSet: ["info.state", "info.error"]
         })
      }), true);
   let version = "";
   let waiting = true;
   while(waiting) {
      let updateSet = await vimPort.waitForUpdatesEx(propertyCollector,
            version);
      version = updateSet.version;
      updateSet.filterSet.
         filter(({filter: {value}}) => value === filter.value).
         reduce((previous, {objectSet}) => [...previous, ...objectSet], []).
         reduce((previous, {changeSet}) => [...previous, ...changeSet], []).
         forEach(({name, val}) => {
            if (name === "info.error" && val !== undefined) {
               throw Error(val.localizedMessage);
            }
            if (name === "info.state" && val === vim.TaskInfoState.success) {
               waiting = false;
            }
         });
   }
   await vimPort.destroyPropertyFilter(filter);
}

async function uploadFile(filePath, uploadUrl) {
   return new Promise((resolve, reject) => {
      var {hostname, port, path} = url.parse(uploadUrl);
      var method = "PUT";
      fs.createReadStream(filePath).pipe(https.request({
         hostname, method, path, port
      }, (res) => {
         if (res.statusCode === 200) {
            resolve();
         } else {
            reject();
         }
      }));
   });
}

async function contentWorkflow(cisService, vimService, targetObjects) {
   let {content, ovf, uuid} = cisService;
   let {library, localLibrary} = content;
   let {datastore, resourcePool} = targetObjects;
   console.log("Content Libraries", await library.list());
   console.log("Local Content Libraries", await localLibrary.list());
   let libraryModel = content.LibraryModel({
      description: "Publish library backed by a VC Datastore",
      id: uuid(),
      name: "PublishLibrary",
      publishInfo: library.PublishInfo({
         authenticationMethod: library.PublishInfo.AuthenticationMethod.NONE,
         published: true
      }),
      storageBackings: [
         library.StorageBacking({
            type: library.StorageBacking.Type.DATASTORE,
            datastoreId: datastore.value
         })
      ],
      type: content.LibraryModel.LibraryType.LOCAL
   });
   let libraryId = await localLibrary.create(uuid(), libraryModel);
   console.log("Library Id", libraryId);
   let itemModel = library.ItemModel({
      description: "Upload to VC Datastore",
      id: uuid(),
      libraryId,
      name: "LibraryItem",
      type: "ovf"
   });
   let libraryItemId = await library.item.create(uuid(), itemModel);
   console.log("Library Item Id", libraryItemId);
   let libraryItem = await library.item.get(libraryItemId);
   console.log("Library Item Version", libraryItem.contentVersion);
   let updateModelSpec = library.item.UpdateSessionModel({
      libraryItemId,
      libraryItemContentVersion: libraryItem.contentVersion
   });
   let sessionId = await library.item.updateSession.create(uuid(),
         updateModelSpec);
   let templatePath = path.join(__dirname, "cisService");
   let fileNames = fs.readdirSync(templatePath);
   for (let name of fileNames) {
      let addSpec = library.item.updatesession.file.AddSpec({
         name,
         sourceType: library.item.updatesession.file.SourceType.PUSH
      });
      let info = await library.item.updatesession.file.add(sessionId, addSpec);
      let filePath = path.join(templatePath, name);
      await uploadFile(filePath, info.uploadEndpoint.uri);
   }
   let {invalidFiles, missingFiles} =
         await library.item.updatesession.file.validate(sessionId);
   if (invalidFiles.length === 0 && missingFiles.length === 0) {
      await library.item.updateSession.complete(sessionId);
      await library.item.updateSession.delete(sessionId);
   } else if (invalidFiles.length !== 0) {
      await library.item.updateSession.fail(sessionId,
            invalidFiles[0].errorMessage);
      await library.item.updateSession.delete(sessionId);
      console.info("Invalid Files", invalidFiles);
      throw Error(invalidFiles);
   } else if (missingFiles.length !== 0) {
      await library.item.updateSession.cancel(sessionId);
      throw Error("Missing Files: " + missingFiles);
   }
   libraryItem = await library.item.get(libraryItemId);
   console.log("Library Item Version After Upload",
         libraryItem.contentVersion);
   let deploymentTarget = ovf.libraryItem.DeploymentTarget({
      resourcePoolId: resourcePool.value
   });
   let ovfSummary = await ovf.libraryItem.filter(libraryItemId,
         deploymentTarget);
   let deploymentSpec = ovf.libraryItem.ResourcePoolDeploymentSpec({
      acceptAllEULA: true,
      annotation: ovfSummary.annotation,
      name: "ContentLibraryVM"
   });
   let deploymentResult = await ovf.libraryItem.deploy(uuid(), libraryItemId,
         deploymentTarget, deploymentSpec);
   console.log("Virtual Machine Id", deploymentResult.resourceId.id);
   let vmRef = vimService.vim.ManagedObjectReference({
      type: "VirtualMachine",
      value: deploymentResult.resourceId.id
   });
   await completeTask(vimService,
         await vimService.vimPort.powerOnVMTask(vmRef));
   console.log("Virtual Machine Powered On");
   await completeTask(vimService,
         await vimService.vimPort.powerOffVMTask(vmRef));
   await completeTask(vimService,
         await vimService.vimPort.destroyTask(vmRef));
   await library.item.delete(libraryItemId);
   await localLibrary.delete(libraryId);
}

async function taggingWorkflow(cisService, targetObjects) {
   let {tagging, vapi} = cisService;
   let {cluster} = targetObjects;
   console.log("Categories", await tagging.category.list());
   console.log("Tags", await tagging.tag.list());
   let categoryCreateSpec = tagging.category.CreateSpec({
      name: "Asset",
      description: "All data center assets",
      cardinality: tagging.CategoryModel.Cardinality.MULTIPLE,
      associableTypes: []
   });
   let categoryId = await tagging.category.create(categoryCreateSpec);
   let tagCreateSpec = tagging.tag.CreateSpec({
      name: "Asset",
      description: "All data center assets",
      categoryId
   });
   let tagId = await tagging.tag.create(tagCreateSpec);
   let clusterDynamicId = vapi.std.DynamicID({
      id: cluster.value,
      type: cluster.type
   });
   let tagUpdateSpec = tagging.tag.UpdateSpec({
      description: "Tag updated at " + Date()
   });
   await tagging.tag.update(tagId, tagUpdateSpec);
   let attachableTags =
         await tagging.tagAssociation.listAttachableTags(clusterDynamicId);
   if (attachableTags.indexOf(tagId) !== -1) {
      await tagging.tagAssociation.attach(tagId, clusterDynamicId);
      console.log("Cluster '" + cluster.value +
            "' has been tagged with '" + tagId + "'");
      await tagging.tagAssociation.detach(tagId, clusterDynamicId);
   }
   await tagging.tag.delete(tagId);
   await tagging.category.delete(categoryId);
}

async function sample(hostname, username, password) {
   console.log("Connecting to " + hostname + "...");
   try {
      let cisService = await vsphere.cisService(hostname);
      let stsService = await vsphere.stsService(hostname);
      let vimService = await vsphere.vimService(hostname);
      let samlToken = await issueToken(stsService, username, password);
      let handler = appendToken.bind(null, stsService, samlToken);
      vimService.addHandler(handler);
      await vimService.vimPort.loginByToken(
            vimService.serviceContent.sessionManager);
      vimService.removeHandler(handler);
      cisService.setSecurityContext({
         samlToken: new xmldom.XMLSerializer().serializeToString(samlToken),
         schemeId: cisService.vapi.std.AuthenticationScheme.SAML_BEARER_TOKEN
      });
      let sessionId = await cisService.cis.session.create();
      cisService.setSecurityContext({
         schemeId: cisService.vapi.std.AuthenticationScheme.SESSION_ID,
         sessionId
      });
      let targetObjects = await retrieveTargetObjects(vimService);
      if (targetObjects.cluster) {
         await contentWorkflow(cisService, vimService, targetObjects);
         await taggingWorkflow(cisService, targetObjects);
      } else {
         console.log("This sample requires a vCenter with a cluster");
      }
      await vimService.vimPort.logout(vimService.serviceContent.sessionManager);
      await cisService.cis.session.delete();
   } catch (err) {
      console.log(err.message);
   }
}

read({prompt: "Hostname: "}, (err, hostname) => {
   read({prompt: "Username: "}, (err, username) => {
      read({prompt: "Password: ", replace: "*", silent: true},
         (err, password) => sample(hostname, username, password));
   });
});
