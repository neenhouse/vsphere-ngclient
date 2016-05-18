$(function() {

   "use strict";

   function getCookie(name) {
      var re = RegExp("(?:^|;\\s*)" + name + "=([^;]*)");
      var match = document.cookie.match(re);
      return match ? match[1] : undefined;
   }

   function setCookie(name, value) {
      document.cookie = name + "=" +
            (value !== undefined ? value : ";expires=" + new Date(0));
   }

   function hideAlert() {
      alert.addClass("hide");
   }

   function showAlert(message) {
      alert.html(message);
      alert.removeClass("hide");
   }

   function showSession() {
      session.removeClass("hide");
   }

   function toggleSession() {
      session.find("input").each(function() {
         var el = $(this);
         if (el.attr("type") == "submit") {
            var value = el.val();
            el.removeAttr("disabled");
            el.val(el.data("alt"));
            el.data("alt", value);
         } else {
            el.toggle();
         }
      });
   }

   function hideContent() {
      content.empty();
   }

   function showContent() {
      var propertyCollector = service.serviceContent.propertyCollector;
      var rootFolder = service.serviceContent.rootFolder;
      var viewManager = service.serviceContent.viewManager;
      var type = "ManagedEntity";
      return service.vimPort.createContainerView(viewManager, rootFolder,
            [type], true).then(function(containerView) {
               return service.vimPort.retrievePropertiesEx(propertyCollector, [
                  service.vim.PropertyFilterSpec({
                     objectSet : service.vim.ObjectSpec({
                        obj: containerView,
                        skip: true,
                        selectSet: service.vim.TraversalSpec({
                           path: "view",
                           type: "ContainerView"
                        })
                     }),
                     propSet: service.vim.PropertySpec({
                        type: type,
                        pathSet: ["name"]
                     })
                  })
               ], service.vim.RetrieveOptions());
            }).then(function(result) {
               content.html(result.objects.reduce(function(previous, current) {
                  return previous + "<p>type:" + current.obj.type +
                        ", name:" + current.propSet[0].val + "</p>";
               }, "<h2>" + cookie + "</h2>"));
            });
   }

   var alert = $(".alert");
   var content = $(".content");
   var cookieKey = "hostname";
   var cookie = getCookie(cookieKey);
   var service;
   var serviceOptions = {
      proxy: true
   };
   var session = $(".session");
   session.on("submit", function(evt) {
      evt.preventDefault();
      hideAlert();
      var submit = $("[name='submit']");
      submit.attr("disabled", true);
      if (cookie !== undefined && service !== undefined) {
         service.vimPort.logout(service.serviceContent.sessionManager).
               then(function() {
                  hideContent();
                  toggleSession();
                  setCookie(cookieKey);
                  cookie = undefined;
                  service = undefined;
               });
      } else {
         var hostname = $("[name='hostname']").val();
         var username = $("[name='username']").val();
         var password = $("[name='password']").val();
         return vsphere.vimService(hostname, serviceOptions).
               then(function(vimService) {
                  service = vimService;
                  service.vimPort.login(service.serviceContent.sessionManager,
                        username, password).then(function() {
                           cookie = hostname;
                           setCookie(cookieKey, cookie);
                           toggleSession();
                           showSession();
                           return showContent();
                        }, function(err) {
                           submit.removeAttr("disabled");
                           showAlert(err.message);
                        });
               }, function(err) {
                  submit.removeAttr("disabled");
                  showAlert(err.message);
               });
      }
   });

   if (cookie !== undefined) {
      vsphere.vimService(cookie, serviceOptions).then(function(vimService) {
         service = vimService;
         return showContent();
      }).then(function() {
         showSession();
         toggleSession();
      }, function(err) {
         showSession();
         if (err.info instanceof service.vim.NotAuthenticated) {
            setCookie(cookieKey);
            cookie = undefined;
         } else {
            toggleSession();
         }
         showAlert(err.message);
      });
   } else {
      showSession();
   }

});
