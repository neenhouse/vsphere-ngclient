class SidenavController {

    /**
     * Constructor class SidenavController
     *
     * @param {object} $scope
     */
    constructor($scope, Vsphere) {
        'ngInject';
        $scope.connection = Vsphere.connection;
    }
}

export default SidenavController;
