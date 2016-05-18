$(function() {

   "use strict";

   function issueToken(stsService, user, pass) {
      var samlToken;
      var requestSecurityToken = stsService.wst13.RequestSecurityTokenType({
         Delegatable: true,
         KeyType: stsService.wst13.KeyTypeEnum
               ["http://docs.oasis-open.org/ws-sx/ws-trust/200512/Bearer"],
         Lifetime: stsService.wst13.LifetimeType({
            Created: stsService.wsu.AttributedDateTime({
               value: new Date().toISOString()
            }),
            Expires: stsService.wsu.AttributedDateTime({
               value: new Date(Date.now() + 1000 * 60 * 10).toISOString()
            })
         }),
         Renewing: stsService.wst13.RenewingType({
            Allow: false,
            OK: false
         }),
         RequestType: stsService.wst13.RequestTypeOpenEnum
               ["http://docs.oasis-open.org/ws-sx/ws-trust/200512/Issue"],
         SignatureAlgorithm:
               "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
         TokenType:
               "urn:oasis:names:tc:SAML:2.0:assertion"
      });
      stsService.addHandler(function(context) {
         if (context.outgoing) {
            var securityHeader = stsService.wsse.SecurityHeaderType({
               Timestamp: stsService.wsu.TimestampType({
                  Created: stsService.wsu.AttributedDateTime({
                     value: new Date().toISOString()
                  }),
                  Expires: stsService.wsu.AttributedDateTime({
                     value: new Date(Date.now() + 1000 * 60 * 10).toISOString()
                  })
               }),
               UsernameToken: stsService.wsse.UsernameTokenType({
                  Username: stsService.wsse.AttributedString({
                     value: user
                  }),
                  Password: stsService.wsse.PasswordString({
                     value: pass
                  })
               })
            });
            var header = context.body.createElementNS(
                  "http://schemas.xmlsoap.org/soap/envelope/", "Header");
            header.appendChild(stsService.serializeObject(securityHeader,
                  "Security"));
            context.body.firstChild.insertBefore(header,
                  context.body.firstChild.firstChild);
         }
      });
      stsService.addHandler(function(context) {
         if (!context.outgoing) {
            samlToken = context.body.getElementsByTagNameNS(
                  "urn:oasis:names:tc:SAML:2.0:assertion", "Assertion")[0];
         }
      });
      return stsService.stsPort.issue(requestSecurityToken).then(function() {
         return samlToken;
      });
   }

   var alert = $(".alert");
   var content = $(".content");
   var serviceOptions = {
      proxy: true
   };
   var session = $(".session");
   session.on("submit", function(evt) {
      evt.preventDefault();
      alert.addClass("hide");
      content.empty();
      var hostname = $("[name='hostname']").val();
      var username = $("[name='username']").val();
      var password = $("[name='password']").val();
      var submit = $("[name='submit']");
      submit.attr("disabled", true);
      vsphere.stsService(hostname, serviceOptions).then(function(stsService) {
         return issueToken(stsService, username, password);
      }).then(function(samlToken) {
         submit.removeAttr("disabled");
         content.append("<p>AssertionId: " +
               samlToken.getAttribute("ID") + "</p>");
         content.append("<p>Issued On: " +
               samlToken.getAttribute("IssueInstant") + "</p>");
      }, function(err) {
         submit.removeAttr("disabled");
         alert.html(err.message).removeClass("hide");
      });
   });

});
