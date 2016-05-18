import SidenavController from './sidenav.controller';
import VsphereModule from '../vsphere/vsphere.module';

let sidenavModule = angular.module('demo.sidenav', [VsphereModule]);

sidenavModule.controller('SidenavController', SidenavController);

export default sidenavModule = sidenavModule.name
