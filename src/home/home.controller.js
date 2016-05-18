function getServersMock(){
  var servers = [];
  for(var i=0; i<11; i++){
      servers.push({
        row:1,
        col:1,
        name:'Server #' + i,
        background:'deepBlue'
      });
  }
  return servers;
}

class HomeController {

    /**
     * Constructor class HomeController
     *
     * @param {object} $scope
     */
    constructor($scope) {
        'ngInject';
        $scope.servers = getServersMock();
    }
}

export default HomeController;
