import Vsphere from '../lib/vsphere-es5';
//import Vsphere from 'vsphere'; // cannot resolve modules

class VsphereService {

    /**
     * Constructor class SidenavController
     *
     * @param {object} $scope
     */
    constructor() {
        'ngInject';
        this.connection = {
          host:'172.16.62.128',
          username:'root',
          password:'password'
        };
        this.connect();
    }

    connect(){
      debugger;
      var vc = new Vsphere.Client(this.connection.host, this.connection.username, this.connection.password, false);
      vc.once('ready', function() {
        console.log('ready');
      });
      vc.once('error', function(err) {
        console.error('error connectiong:', err);
      });

    }
}

export default VsphereService;
