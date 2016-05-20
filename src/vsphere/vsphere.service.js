import Vsphere from '../lib/vsphere-es5';
import { EventEmitter } from 'events';

function getCookie(name) {
   var re = RegExp("(?:^|;\\s*)" + name + "=([^;]*)");
   var match = document.cookie.match(re);
   return match ? match[1] : undefined;
}

function setCookie(name, value) {
   document.cookie = name + "=" +
         (value !== undefined ? value : ";expires=" + new Date(0));
}

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

class VsphereService extends EventEmitter {

    /**
     * Constructor class SidenavController
     *
     * @param {object} $scope
     */
    constructor() {
        'ngInject';
        super();
        this.connection = {
          host:'172.16.62.128',
          username:'root',
          password:'password'
        };
        this.service = null;
        this.cookie = null;
        this.connect();
    }
    connect(){
      return Vsphere.vimService(this.connection.host, { proxy:true })
        .then((vimService) => {
           this.service = vimService;
           // If logged in, logout
           if (this.cookie !== undefined && this.service !== undefined) {
              this.service.vimPort.logout(this.service.serviceContent.sessionManager).
                then(() => {
                   this.login();
                });
           } else {
             this.login();
           }
        }, function(err) {
           alert(err.message);
        });
    }
    login(){
      this.service.vimPort.login(this.service.serviceContent.sessionManager,
        this.connection.username, this.connection.password).then(function(user) {
           this.cookie = this.connection.host;
           setCookie('hostname', this.cookie);
           this.getContent();
        }.bind(this), function(err) {
           alert(err.message);
        });
    }
    getContent(){
      var propertyCollector = this.service.serviceContent.propertyCollector;
      var rootFolder = this.service.serviceContent.rootFolder;
      var viewManager = this.service.serviceContent.viewManager;
      var type = "ManagedEntity";
      return this.service.vimPort.createContainerView(viewManager, rootFolder,
            [type], true).then((containerView) => {
               return this.service.vimPort.retrievePropertiesEx(propertyCollector, [
                  this.service.vim.PropertyFilterSpec({
                     objectSet : this.service.vim.ObjectSpec({
                        obj: containerView,
                        skip: true,
                        selectSet: this.service.vim.TraversalSpec({
                           path: "view",
                           type: "ContainerView"
                        })
                     }),
                     propSet: this.service.vim.PropertySpec({
                        type: type,
                        pathSet: ["name"]
                     })
                  })
               ], this.service.vim.RetrieveOptions());
            }).then((result) => {
              // filter results
              var filtered = result.objects.filter(function(r){ return r.obj.type === 'VirtualMachine'; });
              console.log(filtered);
              filtered = filtered.map(function(item){
                return {
                  name:item.propSet[0].val
                };
              });
              this.emit('data', filtered);
            });
    }
}

export default VsphereService;
