class HomeController {

    /**
     * Constructor class HomeController
     *
     * @param {object} $scope
     */
    constructor($scope, Vsphere) {
        'ngInject';
        $scope.servers = null;
        $scope.togglePower = function(server){
          Vsphere.togglePower(server);
        }
        Vsphere.on('data', (servers) => {
          $scope.servers = servers.map(function(server){
            return {
              ...server,
              row:1,
              col:1,
              background:'deepBlue'
            }
          });
          $scope.$apply();
        });
    }
}

export default HomeController;
