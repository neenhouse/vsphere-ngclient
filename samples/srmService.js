"use strict";

let read = require("read");
let vsphere = require("../dist/vsphere");

function sample(hostname, username, password) {
   console.log("Connecting to " + hostname + "...");
   vsphere.srmService(hostname).then((service) => {
      let serviceContent = service.serviceContent;
      let serviceInstance = service.serviceInstance;
      let srmPort = service.srmPort;
      srmPort.srmLoginLocale(serviceInstance, username, password).then(() => {
         return srmPort.listPlans(serviceContent.recovery);
      }).then((plans) => {
         return Promise.all(plans.map((plan) => {
            return srmPort.recoveryPlanGetInfo(plan);
         }));
      }).then((infos) => {
         if (infos.length !== 0) {
            infos.forEach((info) => {
               console.log("Recovery Plan: " + info.name);
               console.log("Recovery Plan State: " + info.state);
            });
         } else {
            console.log("No Recovery Plans Available");
         }
         srmPort.srmLogoutLocale(serviceInstance);
      });
   }).catch((err) => {
      console.log(err.message);
   });
}

read({prompt: "Hostname: "}, (err, hostname) => {
   read({prompt: "Username: "}, (err, username) => {
      read({prompt: "Password: ", replace: "*", silent: true},
         (err, password) => sample(hostname, username, password));
   });
});
