/**
 * Copyright 2016 VMware, Inc. All rights reserved.
 *
 * This source code is licensed under the VMware Technical Preview License.
 */

(function() {

   "use strict";

   function isArray(value) {
      return Array.isArray(value);
   }

   function isNull(value) {
      return value === null;
   }

   function isObject(value) {
      return typeof value === "object";
   }

   function isUndefined(value) {
      return value === undefined;
   }

   function isUndefinedType(value) {
      return value === "undefined";
   }

   function getRandomValue(max) {
      if (!isUndefinedType(typeof crypto)) {
         return crypto.getRandomValues(new Uint8Array(1))[0] % max;
      }
      if (!isUndefinedType(typeof require) && !isUndefined(require("crypto"))) {
         return require("crypto").randomBytes(1)[0] % max;
      }
      return Math.random() * max;
   }

   function uuid() {
      // Adapted from https://gist.github.com/jed/982883
      var re = /[018]/g;
      return ([1e7] +- 1e3 +- 4e3 +- 8e3 +- 1e11).replace(re, function(a) {
         return (a ^ getRandomValue(16) >> a/4).toString(16);
      });
   }

   function debug(headers, body) {
      var separator = Array(80).join("-");
      console.info(separator);
      each(keys(headers), function(name) {
         console.info(name.toLowerCase() + ": " + headers[name]);
      });
      if (body) {
         console.info(body);
      }
   }

   function formatName(str) {
      return str.replace(/[^_]_[^_]/g, function(match) {
         return match.charAt(0) + match.charAt(2).toUpperCase();
      });
   }

   function toCamelCase(str) {
      return formatName(str).replace(/[^.]+$/, function(match) {
         return match.charAt(0).toLowerCase() + match.substr(1);
      });
   }

   function toPascalCase(str) {
      return formatName(str).replace(/[^.]+$/, function(match) {
         return match.charAt(0).toUpperCase() + match.substr(1);
      });
   }

   function defineProperty(obj, name, value) {
      Object.defineProperty(obj, name, {
         enumerable: true,
         value: value
      });
   }

   function freeze(obj) {
      each(keys(obj), function(key) {
         if (isObject(obj[key])) {
            freeze(obj[key]);
         }
      });
      return Object.freeze(obj);
   }

   function keys(obj) {
      return Object.keys(obj);
   }

   function slice(obj, begin, end) {
      return Array.prototype.slice.call(obj, begin, end);
   }

   function each(list, fn) {
      for (var i = 0, j = list.length; i !== j; ++i) {
         fn(list[i], i, list);
      }
   }

   function unite(arr1, arr2) {
      return arr1.concat((arr2.filter(function(value) {
         return arr1.indexOf(value) === -1;
      })));
   }

   function parseUrl(url) {
      // RFC 3986 Appendix B
      var re = /^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
      var matches = url.match(re);
      return {
         scheme: matches[2],
         authority: matches[4],
         path: matches[5],
         query: matches[7],
         fragment: matches[9]
      };
   }

   function getResponseHeaders(req) {
      var headers = {};
      var str = req.getAllResponseHeaders();
      if (str) {
         var pairs = str.split("\u000d\u000a");
         each(pairs, function(pair) {
            var index = pair.indexOf("\u003a\u0020");
            if (index > 0) {
               var key = pair.substring(0, index);
               var val = pair.substring(index + 2);
               headers[key] = val;
            }
         });
      }
      return headers;
   }

   function request(options) {
      return new Promise(function(resolve, reject) {
         var target = "https://" + options.hostname +
               (isUndefined(options.port) ? "" : ":" + options.port);
         options.headers = options.headers || {};
         options.headers["Content-Type"] = options.contentType;
         if (options.proxy) {
            options.headers[options.proxyHeader] = target;
         }
         var components = parseUrl(options.url);
         var url = (options.proxy ? "" : target) + components.path +
               (isUndefined(components.query) ? "" : "?" + components.query);
         var req = new (isUndefinedType(typeof XMLHttpRequest) ?
               require("xmlhttprequest-cookie").XMLHttpRequest :
                     XMLHttpRequest)();
         req.open(options.method, url);
         if (!isUndefined(req.overrideMimeType)) {
            req.overrideMimeType(options.contentType);
         }
         req.withCredentials = true;
         each(keys(options.headers), function(name) {
            if (!isUndefined(options.headers[name])) {
               req.setRequestHeader(name, options.headers[name]);
            }
         });
         req.onreadystatechange = function() {
            if (req.readyState === 4) {
               if (options.debug) {
                  var obj = {
                     response: url,
                     status: req.status
                  };
                  debug(merge(obj, getResponseHeaders(req)), req.responseText);
               }
               if (req.status === 200) {
                  resolve(req);
               } else {
                  reject(req);
               }
            }
         };
         if (options.debug) {
            var obj = {
               request: url,
               method: options.method
            };
            debug(merge(obj, options.headers), options.data);
         }
         if (options.data) {
            req.send(options.data);
         } else {
            req.send();
         }
      });
   }

   function findNamespaceIndex(namespaces, namespace) {
      for (var i = namespaces.length - 1; i !== -1; --i) {
         if (namespace.indexOf(namespaces[i].name) === 0) {
            return i;
         }
      }
   }

   function findTypeIndex(namespaces, namespaceIndex, name) {
      return namespaces[namespaceIndex].types.indexOf(name);
   }


   function findTypeArr(namespaces, namespace, name) {
      var namespaceIndex = findNamespaceIndex(namespaces, namespace);
      if (!isUndefined(namespaceIndex)) {
         var typeIndex = findTypeIndex(namespaces, namespaceIndex, name);
         if (typeIndex !== -1) {
            return [namespaceIndex, typeIndex];
         }
      }
   }

   function filter(obj) {
      return keys(obj).reduce(function(previous, current) {
         var value = obj[current];
         if (isArray(value)) {
            if (value.length !== 0) {
               previous[current] = value;
            }
         } else if (!isUndefined(value)) {
            previous[current] = value;
         }
         return previous;
      }, {});
   }

   function merge() {
      var result = arguments[0];
      for (var i = 1, l = arguments.length; i !== l; ++i) {
         var obj = arguments[i];
         each(keys(obj), function(key) {
            if (result[key] !== obj[key] || isUndefined(result[key])) {
               if (isArray(result[key]) && isArray(obj[key])) {
                  result[key] = unite(result[key], obj[key]);
               } else if (isObject(result[key]) && isObject(obj[key])) {
                  result[key] = merge(result[key], obj[key]);
               } else {
                  result[key] = obj[key];
               }
            }
         });
      }
      return result;
   }

   function convert(obj, key1, key2) {
      return keys(obj).reduce(function(previous, current) {
         var arr = getObjectArr(key1, obj[current].constructor);
         if (isUndefined(arr)) {
            previous[current] = obj[current];
         } else {
            var arr2 = findTypeArr(getNamespaces(key2),
                  getNamespaceName(key1, arr), getTypeName(key1, arr));
            var instance = createInstance(key2, arr2);
            previous[current] =
                  merge(instance, convert(obj[current], key1, key2));
         }
         return previous;
      }, {});
   }

   function getImplementation(key) {
      return metadata[key].implementation;
   }

   function getExtensions(key) {
      return metadata[key].extensions;
   }

   function getMethods(key) {
      return metadata[key].methods;
   }

   function getNamespace(key, arr) {
      return getNamespaces(key)[getNamespaceIndex(arr)];
   }

   function getNamespaces(key) {
      return metadata[key].namespaces;
   }

   function getNamespaceIndex(arr) {
      return arr[NAMESPACE_INDEX];
   }

   function getNamespaceName(key, arr) {
      return getNamespace(key, arr).name;
   }

   function getNameIndex(arr) {
      return arr[NAME_INDEX];
   }

   function getObjects(key) {
      return metadata[key].objects;
   }

   function getObjectArr(key, object) {
      return metadata[key].names.get(object);
   }

   function getObject(key, arr) {
      var implementation = getImplementation(key);
      var typeName = getTypeName(key, arr);
      if (implementation.isArrayType(typeName)) {
         return Array;
      }
      var namespaceName = getNamespaceName(key, arr);
      var object = getObjects(key)[namespaceName][toPascalCase(typeName)];
      if (isUndefined(getObjectArr(key, object))) {
         metadata[key].names.set(object, arr);
         object.prototype = createPrototype(key, arr, object);
      }
      return object;
   }

   function getOperations(key) {
      return metadata[key].operations;
   }

   function getOperationName(key, arr) {
      return getNamespace(key, arr).operations[getNameIndex(arr)];
   }

   function getOperation(key, arr) {
      return getOperations(key)[getNamespaceIndex(arr)][getNameIndex(arr)];
   }

   function getPackages(key) {
      return metadata[key].packages;
   }

   function getService(key, arr) {
      return getServices(key)[getNamespaceIndex(arr)][getNameIndex(arr)];
   }

   function getServices(key) {
      return metadata[key].services;
   }

   function getTypes(key) {
      return metadata[key].types;
   }

   function getTypeName(key, arr) {
      return getNamespace(key, arr).types[getNameIndex(arr)];
   }

   function getType(key, arr) {
      return getTypes(key)[getNamespaceIndex(arr)][getNameIndex(arr)] || {};
   }

   function getTypeProperty(key, arr, name, defaultValue) {
      var implementation = getImplementation(key);
      var type = getType(key, arr);
      var properties = type[name] || defaultValue;
      var base = type.base;
      if (!isUndefined(base) && !implementation.isBuiltInType(base)) {
         var property = getTypeProperty(key, base, name, defaultValue);
         properties = unite(property, properties);
      }
      var unions = type.unions || [];
      return unions.reduce(function(previous, current) {
         var property = getTypeProperty(key, current, name, defaultValue);
         return unite(previous, property);
      }, properties);
   }

   function getTypeAttributes(key, arr) {
      return getTypeProperty(key, arr, "attributes", []);
   }

   function getTypeConstants(key, arr) {
      return getTypeProperty(key, arr, "constants", []);
   }

   function getTypeElements(key, arr) {
      return getTypeProperty(key, arr, "elements", []);
   }

   function getTypeEnumerations(key, arr) {
      return getTypeProperty(key, arr, "enumerations", []);
   }

   function getTypeRoot(key, arr) {
      var root = getType(key, arr).base;
      if (!isUndefined(root)) {
         return getTypeRoot(key, root);
      } else {
         return arr;
      }
   }

   function createMetadata(key, obj, implementation) {
      if (isUndefined(metadata[key])) {
         metadata[key] = merge({
            extensions: {},
            implementation: implementation,
            methods: {},
            names: new Map(),
            objects: {},
            packages: {}
         }, obj);
         each(obj.namespaces, function(namespace, index) {
            metadata[key].methods[namespace.name] = {};
            each(namespace.operations, function(operationName, operationIndex) {
               var arr = [index, operationIndex];
               defineProperty(metadata[key].methods[namespace.name],
                  toCamelCase(operationName), createMethod(key, arr));
            });
            metadata[key].objects[namespace.name] = {};
            each(namespace.types, function(typeName, typeIndex) {
               var arr = [index, typeIndex];
               var type = getType(key, arr);
               if (!isUndefined(type.container)) {
                  var containerName = getTypeName(key, type.container);
                  typeName = typeName.replace(containerName,
                        toPascalCase(containerName));
               }
               defineProperty(metadata[key].objects[namespace.name],
                     toPascalCase(typeName), createObject(key, arr));
            });
            if (!isUndefined(namespace.services)) {
               metadata[key].packages[namespace.name] = {};
               each(namespace.services, function(serviceName, serviceIndex) {
                  var arr = [index, serviceIndex];
                  defineProperty(metadata[key].packages[namespace.name],
                        toCamelCase(serviceName), createPackage(key, arr));
               });
            }
         });
      }
   }

   function deleteMetadata(key) {
      delete metadata[key];
      storage.removeItem(key);
   }

   function storeMetadata(key, name, obj) {
      try {
         storage.setItem(key, obj);
      } catch (err) {
         for (var i = 0; i !== storage.length; ++i) {
            var itemKey = storage.key(i);
            if (itemKey.indexOf(name) === 0) {
               storage.removeItem(itemKey);
               storeMetadata(key, name, obj);
               return;
            }
         }
         console.warn("Could not free enough storage space.");
      }
   }

   function loadMetadata(hostname, options, key) {
      var implementation = options.implementation;
      return implementation.loadDefinitions(hostname, options).
            then(function(obj) {
               createMetadata(key, obj, implementation);
               var methods = createMethods(key, hostname, options, new Set());
               var objects = getObjects(key);
               return options.init(key, options, methods, objects);
            }).then(function(result) {
               var obj = {
                  namespaces: getNamespaces(key),
                  operations: getOperations(key),
                  services: getServices(key),
                  types: getTypes(key)
               };
               createMetadata(result.key, obj, implementation);
               storeMetadata(result.key, options.key, JSON.stringify(obj));
               return {
                  props: convert(result.props, key, result.key),
                  key: result.key
               };
            });
   }

   function lookupMetadataKey(name) {
      for (var i = 0; i !== storage.length; ++i) {
         var itemKey = storage.key(i);
         if (itemKey.indexOf(name) === 0) {
            return itemKey;
         }
      }
   }

   function lookupMetadata(hostname, options) {
      var key = lookupMetadataKey(options.key);
      var implementation = options.implementation;
      if (isUndefined(key)) {
         key = options.key;
         return loadMetadata(hostname, options, key);
      }
      try {
         createMetadata(key, JSON.parse(storage.getItem(key)), implementation);
         var methods = createMethods(key, hostname, options, new Set());
         var objects = getObjects(key);
         return options.init(key, options, methods, objects).
               then(function(result) {
                  if (key !== result.key) {
                     var obj = JSON.parse(storage.getItem(result.key));
                     if (isNull(obj)) {
                        return loadMetadata(hostname, options, result.key);
                     } else {
                        try {
                           createMetadata(result.key, obj, implementation);
                           return {
                              props: convert(result.props, key, result.key),
                              key: result.key
                           };
                        } catch (err) {
                           deleteMetadata(result.key);
                           return loadMetadata(hostname, options, result.key);
                        }
                     }
                  }
                  return result;
               });
      } catch (err) {
         deleteMetadata(key);
         return loadMetadata(hostname, options, key);
      }
   }

   function createPrototype(key, arr, object) {
      var implementation = getImplementation(key);
      var type = getType(key, arr);
      var elements = type.elements || [];
      var attributes = type.attributes || [];
      var base = type.base;
      var properties = {};
      each(elements.concat(attributes), function(el) {
         if (!isUndefined(el.name)) {
            properties[formatName(el.name)] = {
               enumerable: true,
               writable: true
            };
         }
      });
      var superObject = Object;
      if (!isUndefined(base)) {
         if (implementation.isBuiltInType(base)) {
            properties.value = {
               enumerable: true,
               writable: true
            };
         } else {
            superObject = getObject(key, base);
         }
      }
      properties.constructor = {
         value: object
      };
      return Object.create(superObject.prototype, properties);
   }

   function createInstance(key, arr) {
      return getObject(key, arr)();
   }

   function createInterfaces(obj, namespace) {
      var pattern = RegExp("^" + namespace + "\.");
      return keys(obj[namespace]).reduce(function(previous, current) {
         var parts = current.replace(pattern, "").split(".");
         var value = obj[namespace][current];
         var ref = previous;
         each(parts, function(part, index) {
            if (index + 1 === parts.length) {
               ref[part] = value;
            } else if (isUndefined(ref[part])) {
               ref[part] = {};
               ref = ref[part];
            } else {
               ref = ref[part];
            }
         });
         return previous;
      }, {});
   }

   function createMethod(key, arr) {
      return function(hostname, options, handlers, props) {
         var args = slice(arguments, 4);
         var implementation = getImplementation(key);
         return new Promise(function(resolve, reject) {
            var body = implementation.serialize(key, arr, args, props);
            var headers = implementation.createHeaders(key, arr);
            var values = handlers.values();
            var handler = values.next();
            while (handler.done === false) {
               var context = {
                  body: body,
                  headers: headers,
                  outgoing: true
               };
               if (handler.value(context) === false) {
                  break;
               }
               handler = values.next();
            }
            var data = implementation.serializeRequest(body);
            request({
               contentType: options.contentType,
               data: data,
               debug: options.debug,
               headers: headers,
               hostname: hostname,
               method: "POST",
               port: options.port,
               proxy: options.proxy,
               proxyHeader: options.proxyHeader,
               url: options.endpoint
            }).then(function(req) {
               var body = implementation.parseResponse(req);
               var values = handlers.values();
               var handler = values.next();
               var headers = getResponseHeaders(req);
               if (isUndefinedType(typeof XMLHttpRequest)) {
                  var cookie = req.getResponseHeader("set-cookie");
                  if (!isUndefined(cookie)) {
                     headers["set-cookie"] = cookie;
                  }
               }
               while (handler.done === false) {
                  var context = {
                     body: body,
                     headers: headers,
                     outgoing: false
                  };
                  if (handler.value(context) === false) {
                     break;
                  }
                  handler = values.next();
               }
               try {
                  resolve(implementation.deserialize(key, arr, body));
               } catch (err) {
                  reject(err);
               }
            }, function(req) {
               if (req.status === 500 && req.responseText) {
                  reject(implementation.deserializeError(key,
                        implementation.parseResponse(req)));
               } else {
                  reject(Error(req.statusText));
               }
            });
         });
      };
   }

   function createMethods(key, hostname, options, handlers, props) {
      var methods = {};
      each(keys(getMethods(key)), function(namespace) {
         methods[namespace] = {};
         each(keys(getMethods(key)[namespace]), function(name) {
            methods[namespace][name] =
                  getMethods(key)[namespace][name].bind(null,
                        hostname, options, handlers, props);
         });
      });
      return methods;
   }

   function createObject(key, arr) {
      var enumerations = getTypeEnumerations(key, arr);
      if (enumerations.length !== 0) {
         return enumerations.reduce(function(previous, current) {
            previous[current] = current;
            return previous;
         }, {});
      } else {
         return getTypeConstants(key, arr).reduce(function(previous, current) {
            previous[current.name] = current.value;
            return previous;
         }, function(config) {
            var obj = Object.create(getObject(key, arr).prototype);
            return merge(obj, config || {});
         });
      }
   }

   function createPackage(key, arr) {
      var constants = getService(key, arr).constants || [];
      return constants.reduce(function(previous, current) {
         previous[current.name] = current.value;
         return previous;
      }, {});
   }

   function createService(hostname, options) {
      return lookupMetadata(hostname, options).then(function(result) {
         var handlers = new Set();
         var implementation = getImplementation(result.key);
         var methods = createMethods(result.key,
               hostname, options, handlers, result.props);
         var objects = getObjects(result.key);
         var packages = getPackages(result.key);
         var service = merge({
            addHandler: function(handler) {
               handlers.add(handler);
            },
            removeHandler: function(handler) {
               handlers.delete(handler);
            },
            serializeObject:
                  implementation.serializeObject.bind(null, result.key),
            deserializeObject:
                  implementation.deserializeObject.bind(null, result.key)
         }, result.props);
         var prefixKeys = keys(options.prefixes);
         var prefixes = prefixKeys.reduce(function(previous, current) {
            previous[options.prefixes[current]] = current;
            return previous;
         }, {});
         var union = unite(keys(methods), keys(objects), keys(packages));
         union.filter(function(namespace) {
            return !isUndefined(prefixes[namespace]);
         }).forEach(function(namespace) {
            var methodInterfaces = createInterfaces(methods, namespace);
            var objectInterfaces = createInterfaces(objects, namespace);
            var packageInterfaces = createInterfaces(packages, namespace);
            defineProperty(service, prefixes[namespace],
                  merge(methodInterfaces, objectInterfaces, packageInterfaces));
         });
         return freeze(service);
      });
   }

   function createExports(vsphere) {
      if (!isUndefinedType(typeof exports) && isObject(exports) &&
            !isUndefinedType(typeof module) && isObject(module)) {
         if (isUndefinedType(typeof Map) || isUndefinedType(typeof Promise)) {
            require("es6-shim");
         }
         module.exports = vsphere;
      } else if (typeof define === "function" && define.amd) {
         define([], vsphere);
      } else if (!isUndefinedType(typeof window)) {
         window.vsphere = vsphere;
      }
   }

   function createJsonRpcImplementation() {

      function getValue(obj) {
         if (obj.STRUCTURE) {
            return obj.STRUCTURE[keys(obj.STRUCTURE)[0]];
         } else if (obj.OPTIONAL) {
            return getValue(obj.OPTIONAL);
         } else {
            return obj;
         }
      }

      function parseType(namespaces, type) {
         var value = getValue(type);
         switch (value.category) {
            case "BUILTIN":
               var builtin = getValue(value.builtin_type);
               return {
                  type: [0, namespaces[0].types.indexOf(builtin)]
               };
            case "GENERIC":
               var instantiation = getValue(value.generic_instantiation);
               var generic = getValue(instantiation.generic_type);
               var result = {
                  type: [1, namespaces[1].types.indexOf(generic)]
               };
               if (!isUndefined(instantiation.element_type)) {
                  result.typeElement = parseType(namespaces,
                        getValue(instantiation.element_type));
               }
               if (!isUndefined(instantiation.map_key_type)) {
                  result.typeKey = parseType(namespaces,
                        getValue(instantiation.map_key_type));
               }
               if (!isUndefined(instantiation.map_value_type)) {
                  result.typeValue = parseType(namespaces,
                        getValue(instantiation.map_value_type));
               }
               return result;
            case "USER_DEFINED":
               var userType = getValue(value.user_defined_type);
               var resourceId = getValue(userType.resource_id);
               return {
                  type: findTypeArr(namespaces, resourceId, resourceId)
               };
         }
      }

      function parseConstantValue(namespaces, info, value) {
         var arr = info.type;
         var name = namespaces[getNamespaceIndex(arr)].types[getNameIndex(arr)];
         if (implementation.isBuiltInType(arr)) {
            switch (name) {
               case "STRING":
                  var primitiveValue = getValue(value).primitive_value;
                  var stringValue = getValue(primitiveValue).string_value;
                  return getValue(stringValue);
            }
         } else if (implementation.isArrayType(arr)) {
            switch (name) {
               case "LIST":
                  var listValue = getValue(value).list_value;
                  return getValue(listValue).map(function(item) {
                     var type = info.typeElement.type;
                     var namespace = namespaces[getNamespaceIndex(type)];
                     switch (namespace.types[getNameIndex(type)]) {
                        case "STRING":
                           var stringValue = getValue(item).string_value;
                           return getValue(stringValue);
                     }
                  });
            }
         }
      }

      function parseConstant(namespaces, constant) {
         var value = getValue(constant).value;
         var info = parseType(namespaces, getValue(value).type);
         return merge({
            name: getValue(constant).key,
            value: parseConstantValue(namespaces, info, getValue(value).value)
         }, info);
      }

      function processDefinition(data) {
         var namespaces = [{
            name: "BUILTIN",
            operations: [],
            services: [],
            types: [
               "ANY_ERROR",
               "BINARY",
               "BOOLEAN",
               "DATE_TIME",
               "DOUBLE",
               "DYNAMIC_STRUCTURE",
               "ID",
               "LONG",
               "OPAQUE",
               "SECRET",
               "STRING",
               "URI",
               "VOID"
            ]}, {
               name: "GENERIC",
               operations: [],
               services: [],
               types: [
                  "LIST",
                  "MAP",
                  "OPTIONAL",
                  "SET"
               ]
            }];
         var operations = [[], []];
         var services = [[], []];
         var types = [[], []];
         var union = unite(keys(data.operations),
               keys(data.services), keys(data.types));
         each(union, function(namespace) {
            namespaces.push({
               name: namespace,
               operations: keys(data.operations[namespace]).map(function(name) {
                  return name;
               }),
               services: keys(data.services[namespace]).map(function(name) {
                  return name;
               }),
               types: keys(data.types[namespace]).map(function(name) {
                  return name;
               })
            });
         });
         each(union, function(namespace) {
            var operationKeys = keys(data.operations[namespace]);
            operations.push(operationKeys.map(function(name) {
               var operation = data.operations[namespace][name];
               return [
                  operation.params.map(function(param) {
                     var entry = getValue(param);
                     return merge({
                        name: entry.name
                     }, parseType(namespaces, entry.type));
                  }),
                  parseType(namespaces, getValue(operation.output).type)
               ];
            }));
         });
         each(union, function(namespace) {
            var serviceKeys = keys(data.services[namespace]);
            services.push(serviceKeys.reduce(function(previous, current) {
               var service = getValue(data.services[namespace][current]);
               var constants = [];
               if (!isUndefined(service.constants)) {
                  constants = service.constants.map(function(constant) {
                     return parseConstant(namespaces, constant);
                  });
               }
               previous.push(filter({
                  constants: constants
               }));
               return previous;
            }, []));
         });
         each(union, function(namespace) {
            var typeKeys = keys(data.types[namespace]);
            types.push(typeKeys.reduce(function(previous, current) {
               var value = getValue(data.types[namespace][current]);
               if (!isUndefined(value.values)) {
                  var type = {
                     enumerations: value.values.map(function(enumeration) {
                        return getValue(enumeration).value;
                     })
                  };
                  var container = findTypeArr(namespaces, namespace,
                        value.container.name);
                  if (!isUndefined(container)) {
                     type.container = container;
                  }
                  previous.push(type);
               } else {
                  var attributes = [];
                  if (!isUndefined(value.fields)) {
                     attributes = value.fields.map(function(field) {
                        var value = getValue(field);
                        return merge({
                           name: value.name
                        }, parseType(namespaces, value.type));
                     });
                  }
                  var constants = [];
                  if (!isUndefined(value.constants)) {
                     constants = value.constants.map(function(constant) {
                        return parseConstant(namespaces, constant);
                     });
                  }
                  previous.push(filter({
                     attributes: attributes,
                     constants: constants,
                     type: value.type
                  }));
               }
               return previous;
            }, []));
         });
         return {
            namespaces: namespaces,
            operations: operations,
            services: services,
            types: types
         };
      }

      function processEnumerations(data, namespace, obj) {
         each(obj.enumerations, function(enumeration) {
            var entry = getValue(enumeration);
            var value = getValue(entry.value);
            data.types[namespace][entry.key] = merge({
               container: obj
            }, value);
         });
      }

      function processServices(data, namespace, obj) {
         each(obj.services, function(service) {
            var entry = getValue(service);
            var value = getValue(entry.value);
            data.services[namespace][entry.key] = value;
            each(value.operations, function(operation) {
               var value = getValue(operation);
               data.operations[namespace][entry.key + "." + value.key] =
                  getValue(value.value);
            });
            processEnumerations(data, namespace, value);
            processStructures(data, namespace, value);
         });
      }

      function processStructures(data, namespace, obj) {
         each(obj.structures, function(structure) {
            var entry = getValue(structure);
            var value = getValue(entry.value);
            data.types[namespace][entry.key] = value;
            processEnumerations(data, namespace, value);
         });
      }

      function processResponse(url, doc, data) {
         var output = getValue(doc.output);
         var info = getValue(output.info);
         var namespace = info.name;
         each(info.packages, function(pkg) {
            var entry = getValue(pkg);
            var value = getValue(entry.value);
            if (entry.key.indexOf(namespace) === 0) {
               data.operations[namespace] = data.operations[namespace] || {};
               data.services[namespace] = data.services[namespace] || {};
               data.types[namespace] = data.types[namespace] || {};
               processEnumerations(data, namespace, value);
               processServices(data, namespace, value);
               processStructures(data, namespace, value);
            }
         });
      }

      function load(definition, hostname, options, data) {
         return new Promise(function(resolve, reject) {
            request({
               contentType: options.contentType,
               data: implementation.serializeRequest({
                  ctx: {},
                  input: {
                     STRUCTURE: {
                        "operation-input": {
                           component_id: definition
                        }
                     }
                  },
                  operationId: "get",
                  serviceId: "com.vmware.vapi.metadata.metamodel.component"
               }),
               hostname: parseUrl(options.endpoint).authority || hostname,
               method: "POST",
               port: options.port,
               proxy: options.proxy,
               proxyHeader: options.proxyHeader,
               url: options.endpoint
            }).then(function(req) {
               processResponse(definition,
                     implementation.parseResponse(req), data);
               resolve();
            }, function(req) {
               reject(Error(req.statusText));
            });
         });
      }

      var implementation = {
         createHeaders: function() {
            return {};
         },
         createOptions: function(serviceOptions, userOptions) {
            return merge({}, defaults, {
               init: function(key, options, methods) {
                  var definitions = options.definitions;
                  var fingerprint = methods["com.vmware.vapi"]["com.vmware" +
                        ".vapi.metadata.metamodel.component.fingerprint"];
                  return Promise.all(definitions.map(function(definition) {
                     return fingerprint(definition);
                  })).then(function(values) {
                     var securityContext;
                     var version = values.reduce(function(previous, current) {
                        return previous + current.substr(0, 8);
                     }, "");
                     return {
                        key: [options.key, version].join("/"),
                        props: {
                           getSecurityContext: function() {
                              return securityContext;
                           },
                           setSecurityContext: function(value) {
                              securityContext = value;
                           },
                           uuid: uuid
                        }
                     };
                  });
               },
               contentType: "application/json",
               definitions: [
                  "com.vmware.vapi"
               ],
               implementation: implementation,
               prefixes: {
                  builtin: "BUILTIN",
                  vapi: "com.vmware.vapi"
               }
            }, serviceOptions, userOptions || {});
         },
         deserialize: function(key, arr, message) {
            if (!isUndefined(message.output)) {
               var operation = getOperation(key, arr);
               var info = operation[OUTPUT_INDEX];
               return implementation.deserializeObject(key,
                     message.output, info);
            } else if (!isUndefined(message.error)) {
               throw implementation.deserializeError(key, message);
            }
         },
         deserializeError: function(key, message) {
            var err = Error();
            err.name = keys(message.error.ERROR)[0];
            var type = findTypeArr(getNamespaces(key), err.name, err.name);
            err.info = implementation.deserializeObject(key, message.error,
                  {type: type});
            var messages = err.info.messages;
            if (!isUndefined(messages) && messages.length !== 0) {
               err.message = messages[0].defaultMessage;
            }
            return err;
         },
         deserializeObject: function(key, data, info) {
            var arr = info.type;
            var typeElement = info.typeElement;
            var typeKey = info.typeKey;
            var name = getTypeName(key, arr);
            if (implementation.isBuiltInType(arr)) {
               switch (name) {
                  case "DATE_TIME":
                     return new Date(data);
                  case "ID":
                     return data;
                  case "SECRET":
                     return data.SECRET;
                  case "STRING":
                     return data;
                  case "VOID":
                     return;
                  default:
                     return data;
               }
            } else if (implementation.isArrayType(arr)) {
               return data.map(function(obj) {
                  return implementation.deserializeObject(key, obj,
                        typeElement);
               });
            } else if (!isUndefined(typeElement)) {
               if (!isNull(data[name])) {
                  return implementation.deserializeObject(key,
                        data[name], typeElement);
               }
            } else if (!isUndefined(typeKey)) {
               var typeValue = info.typeValue;
               return data.reduce(function(previous, current) {
                  var entry = getValue(current);
                  previous[entry.key] = implementation.deserializeObject(key,
                        entry.value, typeValue);
                  return previous;
               }, {});
            } else {
               var type = getType(key, arr);
               var enumerations = getTypeEnumerations(key, arr);
               if (enumerations.length !== 0) {
                  return data;
               } else {
                  var attributes = getTypeAttributes(key, arr);
                  return attributes.reduce(function(previous, current) {
                     if (!isNull(data)) {
                        var value = implementation.deserializeObject(key,
                              data[type.type][name][current.name], current);
                        if (!isUndefined(value)) {
                           previous[formatName(current.name)] = value;
                        }
                     }
                     return previous;
                  }, createInstance(key, arr));
               }
            }
         },
         isArrayType: function(arr) {
            return getNamespaceIndex(arr) === 1 &&
               (getNameIndex(arr) == 0 || getNameIndex(arr) == 3);
         },
         isBuiltInType: function(arr) {
            return getNamespaceIndex(arr) === 0;
         },
         loadDefinitions: function(hostname, options) {
            var data = {
               operations: {},
               services: {},
               types: {}
            };
            return Promise.all(options.definitions.map(function(definition) {
               return load(definition, hostname, options, data);
            })).then(function() {
               return processDefinition(data);
            });
         },
         parseResponse: function(req) {
            return JSON.parse(req.responseText).result;
         },
         serialize: function(key, arr, args, props) {
            var name = getOperationName(key, arr);
            var parts = name.split(".");
            var operationId = parts.pop();
            var serviceId = parts.join(".");
            var operation = getOperation(key, arr);
            var input = args.reduce(function(previous, current, index) {
               var info = operation[INPUT_INDEX][index];
               previous[info.name] = implementation.serializeObject(key,
                     current, getTypeName(key, info.type), info);
               return previous;
            }, {});
            return {
               ctx: merge({
                  appCtx: {
                     opId: uuid()
                  }
               }, isUndefined(props) ? {} : {
                  securityCtx: props.getSecurityContext()
               }),
               input: {
                  STRUCTURE: {
                     "operation-input": input
                  }
               },
               operationId: operationId,
               serviceId: serviceId
            };
         },
         serializeObject: function(key, obj, name, info) {
            var arr = info.type;
            var typeElement = info.typeElement;
            var typeKey = info.typeKey;
            var enumerations = getTypeEnumerations(key, arr);
            if (implementation.isBuiltInType(arr) ||
                  enumerations.length !== 0) {
               return obj;
            } else if (implementation.isArrayType(arr)) {
               return obj.map(function(item) {
                  return implementation.serializeObject(key, item,
                        getTypeName(key, typeElement.type), typeElement);
               });
            } else if (!isUndefined(typeElement)) {
               var typeResult = {};
               typeResult[getTypeName(key, arr)] = isUndefined(obj) ? null :
                     implementation.serializeObject(key, obj,
                           getTypeName(key, typeElement.type), typeElement);
               return typeResult;
            } else if (!isUndefined(typeKey)) {
               return keys(obj).map(function(objKey) {
                  return {
                     STRUCTURE: {
                        "map-entry": {
                           key: objKey,
                           value: implementation.serializeObject(key,
                              obj[objKey], objKey, info.typeValue)
                        }
                     }
                  };
               });
            } else {
               var type = getType(key, arr);
               var result = {};
               result[type.type] = {};
               result[type.type][name] = {};
               each(type.attributes, function(attr) {
                  result[type.type][name][attr.name] =
                        implementation.serializeObject(key,
                              obj[formatName(attr.name)], attr.name, attr);
               });
               return result;
            }
         },
         serializeRequest: function(params) {
            return JSON.stringify({
               id: uuid(),
               jsonrpc: "2.0",
               method: "invoke",
               params: params
            });
         }
      };

      return implementation;
   }

   function createSoapImplementation() {

      function getAttribute(element, name) {
         return element.getAttribute(name);
      }

      function getByName(element, name) {
         return element.getElementsByTagName(name);
      }

      function getByNameNS(element, namespace, name) {
         return element.getElementsByTagNameNS(namespace, name);
      }

      function getFirstChild(element) {
         for (var i = 0, l = element.childNodes.length; i !== l; ++i) {
            if (element.childNodes[i].nodeType === 1) {
               return element.childNodes[i];
            }
         }
      }

      function lookupNamespace(node, prefix) {
         return node.lookupNamespaceURI(prefix);
      }

      function parseRef(namespaces, node, ref) {
         var parts = ref.split(":"), namespace, name;
         if (parts.length === 2) {
            namespace = lookupNamespace(node, parts[0]);
            name = parts[1];
         } else {
            namespace = node.namespaceURI || XS_NAMESPACE;
            name = parts[0];
         }
         var namespaceIndex = findNamespaceIndex(namespaces, namespace);
         var typeIndex = findTypeIndex(namespaces, namespaceIndex, name);
         // Namespace lookup required by the internal VCDP API
         if (typeIndex === -1) {
            each(namespaces, function(namespace, i) {
               typeIndex = findTypeIndex(namespaces, i, name);
               if (typeIndex !== -1) {
                  namespaceIndex = i;
                  return;
               }
            });
         }
         return [namespaceIndex, typeIndex];
      }

      function getExtension(key, data, type) {
         var extensions = getExtensions(key);
         if (isUndefined(extensions[type])) {
            extensions[type] = parseRef(getNamespaces(key), data, type);
         }
         return extensions[type];
      }

      function setAttribute(element, name, value) {
         return element.setAttribute(name, value);
      }

      function setAttributeNS(element, namespace, name, value) {
         return element.setAttributeNS(namespace, name, value);
      }

      function createElementNS(namespace, name) {
         var firstChild = xmlDocument.firstChild;
         if (!isUndefined(firstChild.getAttribute) &&
            !isNull(firstChild.getAttribute("lineNumber"))) {
            // Workaround for xmldom issue #45
            var element = xmlDocument.createElement(name);
            setAttribute(element, "xmlns", namespace);
            return element;
         } else {
            return xmlDocument.createElementNS(namespace, name);
         }
      }

      function createDocumentNS(namespace, name) {
         var firstChild = xmlDocument.firstChild;
         var implementation = xmlDocument.implementation;
         if (!isUndefined(firstChild.getAttribute) &&
            !isNull(firstChild.getAttribute("lineNumber"))) {
            // Workaround for xmldom issue #45
            var doc = implementation.createDocument(null, name, null);
            setAttribute(doc.firstChild, "xmlns", namespace);
            return doc;
         } else {
            return implementation.createDocument(namespace, name, null);
         }
      }

      function createTextNode(text) {
         return xmlDocument.createTextNode(text);
      }

      function appendChild(element, child) {
         return element.appendChild(child);
      }

      function toProperty(namespaces, node, refs) {
         var obj = {};
         each(node.attributes, function(attr) {
            var name = attr.name;
            var value = attr.value;
            if (name === "ref") {
               var elementName = value.split(":");
               var ref = refs[lookupNamespace(node,
                     elementName[0])][elementName[1]];
               obj.name = getAttribute(ref, "name");
               obj.type = parseRef(namespaces, ref, getAttribute(ref, "type"));
            } else if (name === "type") {
               obj.type = parseRef(namespaces, node, value);
            } else {
               obj[name] = value;
            }
         });
         return obj;
      }

      function toString(key, arr, value) {
         switch (getTypeName(key, arr)) {
            case "anyType":
            case "anyURI":
            case "base64Binary":
            case "boolean":
            case "byte":
            case "date":
            case "dateTime":
            case "float":
            case "ID":
            case "int":
            case "integer":
            case "long":
            case "NCName":
            case "negativeInteger":
            case "nonNegativeInteger":
            case "nonPositiveInteger":
            case "positiveInteger":
            case "QName":
            case "short":
            case "string":
            case "unsignedLong":
               return value;
            default:
               throw Error("Unknown type");
         }
      }

      function fromString(key, arr, value) {
         switch (getTypeName(key, arr)) {
            case "anyURI":
            case "base64Binary":
            case "string":
               return value;
            case "boolean":
               return value.toLowerCase() === "true";
            case "byte":
            case "int":
            case "integer":
            case "long":
            case "NCName":
            case "negativeInteger":
            case "nonNegativeInteger":
            case "nonPositiveInteger":
            case "positiveInteger":
            case "QName":
            case "short":
            case "unsignedLong":
               return parseInt(value);
            case "dateTime":
               return new Date(value);
            case "float":
               return parseFloat(value);
            default:
               throw Error("Unknown type");
         }
      }

      function getOperationElement(namespaces, data, node) {
         var messageName = getAttribute(node, "message").split(":");
         var message = data.messages[lookupNamespace(node,
               messageName[0])][messageName[1]];
         var part = getByNameNS(message, WSDL_NAMESPACE, "part")[0];
         var elementName = getAttribute(part, "element").split(":");
         return data.elements[lookupNamespace(node,
               elementName[0])][elementName[1]];
      }

      function load(url, hostname, options, data, cache) {
         return new Promise(function(resolve, reject) {
            if (!isUndefined(cache[url])) {
               if (!isUndefined(cache[url].data)) {
                  resolve(cache[url].data);
               } else {
                  cache[url].resolve.push(resolve);
                  cache[url].reject.push(reject);
               }
            } else {
               cache[url] = {
                  resolve: [resolve],
                  reject: [reject]
               };
               request({
                  contentType: options.contentType,
                  hostname: parseUrl(url).authority || hostname,
                  method: "GET",
                  port: options.port,
                  proxy: options.proxy,
                  proxyHeader: options.proxyHeader,
                  url: url
               }).then(function(req) {
                  var res = implementation.parseResponse(req);
                  var wsdslImports = getByNameNS(res, WSDL_NAMESPACE, "import");
                  var xsImports = getByNameNS(res, XS_NAMESPACE, "import");
                  var xsIncludes = getByNameNS(res, XS_NAMESPACE, "include");
                  var links = slice(wsdslImports).concat(slice(xsImports)).
                        concat(slice(xsIncludes));
                  cache[url].data = res;
                  cache[url].length = links.length;
                  if (cache[url].length === 0) {
                     processResponse(url, cache[url].data, data);
                     each(cache[url].resolve, function(resolve) {
                        resolve();
                     });
                  } else {
                     each(links, function(element) {
                        var location = getAttribute(element, "location") ||
                              getAttribute(element, "schemaLocation");
                        var components = parseUrl(location);
                        if (!isUndefined(components.scheme)) {
                           location = components.path + (components.query ?
                                 "?" + components.query : "");
                        } else if (components.path.indexOf("/") !== 0) {
                           location = url.replace(/[^\/]+$/, location);
                        }
                        load(location, hostname, options, data, cache).
                              then(function() {
                                 cache[url].length--;
                                 if (cache[url].length === 0) {
                                    processResponse(url, cache[url].data, data);
                                    each(cache[url].resolve, function(resolve) {
                                       resolve();
                                    });
                                 }
                              }, function(err) {
                                 each(cache[url].reject, function(reject) {
                                    reject(err);
                                 });
                              });
                     });
                  }
               }, function(req) {
                  each(cache[url].reject, function(reject) {
                     reject(Error(req.statusText));
                  });
               });
            }
         });
      }

      function processResponse(url, doc, data) {
         var definitions = getByNameNS(doc, WSDL_NAMESPACE, "definitions");
         each(definitions, function(node) {
            var namespace = getAttribute(node, "targetNamespace");
            data.actions[namespace] = data.actions[namespace] || {};
            data.messages[namespace] = data.messages[namespace] || {};
            data.operations[namespace] = data.operations[namespace] || {};
            each(node.childNodes, function(node) {
               switch (node.localName) {
                  case "binding":
                     data.bindings[namespace] = node;
                     each(node.childNodes, function(node) {
                        if (node.localName === "operation") {
                           var operation = getAttribute(node, "name");
                           each(node.childNodes, function(node) {
                              if (node.localName === "operation") {
                                 data.actions[namespace][operation] = node;
                              }
                           });
                        }
                     });
                     break;
                  case "message":
                     data.messages[namespace]
                           [getAttribute(node, "name")] = node;
                     break;
                  case "portType":
                     each(node.childNodes, function(node) {
                        if (node.localName === "operation") {
                           data.operations[namespace]
                                 [getAttribute(node, "name")] = node;
                        }
                     });
                     break;
                  case "service":
                     each(node.childNodes, function(node) {
                        if (node.localName === "port") {
                           data.ports[namespace] = node;
                        }
                     });
                     break;
               }
            });
         });
         var schemas = getByNameNS(doc, XS_NAMESPACE, "schema");
         each(schemas, function(node) {
            var namespace = getAttribute(node, "targetNamespace");
            if (isNull(namespace) || namespace === "") {
               return;
            }
            data.attributes[namespace] = data.attributes[namespace] || {};
            data.types[namespace] = data.types[namespace] || {};
            data.elements[namespace] = data.elements[namespace] || {};
            data.attributeGroups[namespace] =
                  data.attributeGroups[namespace] || {};
            each(node.childNodes, function(node) {
               switch (node.localName) {
                  case "attribute":
                     data.attributes[namespace]
                           [getAttribute(node, "name")] = node;
                     break;
                  case "complexType":
                  case "simpleType":
                     data.types[namespace]
                           [getAttribute(node, "name")] = node;
                     break;
                  case "element":
                     var name = getAttribute(node, "name");
                     data.elements[namespace][name] = node;
                     each(node.childNodes, function(node) {
                        if (node.localName === "complexType" ||
                              node.localName === "simpleType") {
                           setAttribute(node, "name", name);
                           setAttribute(data.elements[namespace][name], "type",
                                 node.lookupPrefix(namespace) + ":" + name);
                           data.types[namespace][name] = node;
                        }
                     });
                     break;
                  case "attributeGroup":
                     data.attributeGroups[namespace]
                           [getAttribute(node, "name")] = node;
                     break;
               }
            });
         });
      }

      function getPortNamespace(data, namespace) {
         return lookupNamespace(data.ports[namespace],
            getAttribute(data.ports[namespace], "binding").split(":")[0]);
      }

      function getPortOperations(data, namespace) {
         var operations = [];
         if (!isUndefined(data.ports[namespace])) {
            var binding = data.bindings[getPortNamespace(data, namespace)];
            each(getByNameNS(binding, binding.namespaceURI,
                  "operation"), function(operation) {
               operations.push(getAttribute(operation, "name"));
            });
         }
         return operations;
      }

      function processDefinition(data) {
         var namespaces = [{
            name: XS_NAMESPACE,
            operations: [],
            services: [],
            types: [
               "anyType",
               "anyURI",
               "base64Binary",
               "boolean",
               "byte",
               "dateTime",
               "double",
               "float",
               "ID",
               "int",
               "integer",
               "long",
               "NCName",
               "negativeInteger",
               "nonNegativeInteger",
               "nonPositiveInteger",
               "positiveInteger",
               "QName",
               "short",
               "string",
               "unsignedLong"
            ]
         }];
         var operations = [[]];
         var services = [[]];
         var types = [[]];
         var union = unite(keys(data.operations), keys(data.types));
         each(union, function(namespace) {
            namespaces.push({
               name: namespace,
               operations: getPortOperations(data, namespace),
               services: [],
               types: keys(data.types[namespace] || {}).map(function(name) {
                  return name;
               })
            });
         });
         each(union, function(namespace) {
            types.push(keys(data.types[namespace] || {}).map(function(name) {
               var attributes = [];
               var elements = [];
               var type = data.types[namespace][name];
               var maxOccurs, minOccurs;
               each(type.childNodes, function(node) {
                  switch (node.localName) {
                     case "sequence":
                     case "choice":
                     case "all":
                        maxOccurs = getAttribute(node, "maxOccurs") ||
                              maxOccurs;
                        minOccurs = getAttribute(node, "minOccurs") ||
                              minOccurs;
                  }
               });
               each(getByNameNS(type, XS_NAMESPACE, "element"), function(node) {
                  var el = toProperty(namespaces, node, data.elements);
                  if (node.parentNode.localName === "choice") {
                     el.minOccurs = "0";
                     maxOccurs = getAttribute(node.parentNode, "maxOccurs") ||
                           maxOccurs;
                  }
                  elements.push(el);
               });
               each(getByNameNS(type, XS_NAMESPACE, "any"), function(node) {
                  elements.push(toProperty(namespaces, node));
               });
               each(getByNameNS(type, XS_NAMESPACE,
                     "attribute"), function(node) {
                  attributes.push(toProperty(namespaces, node,
                        data.attributes));
               });
               each(getByNameNS(type, XS_NAMESPACE,
                     "anyAttribute"), function(node) {
                  attributes.push(toProperty(namespaces, node));
               });
               each(getByNameNS(type, XS_NAMESPACE,
                     "attributeGroup"), function(node) {
                  var parts = getAttribute(node, "ref").split(":");
                  var attrGroup = data.attributeGroups
                        [lookupNamespace(node, parts[0])][parts[1]];
                  each(getByNameNS(attrGroup, XS_NAMESPACE,
                        "attribute"), function(node) {
                     attributes.push(toProperty(namespaces, node,
                           data.attributes));
                  });
                  each(getByNameNS(attrGroup, XS_NAMESPACE,
                        "anyAttribute"), function(node) {
                     attributes.push(toProperty(namespaces, node));
                  });
               });
               var base;
               var extension = getByNameNS(type, XS_NAMESPACE, "extension")[0];
               if (!isUndefined(extension)) {
                  base = parseRef(namespaces, extension,
                        getAttribute(extension, "base"));
               }
               var enumerations = [];
               var unions = [];
               if (type.localName === "simpleType") {
                  each(getByNameNS(type, XS_NAMESPACE,
                        "restriction"), function(node) {
                     each(getByNameNS(node, XS_NAMESPACE,
                           "enumeration"), function(enumeration) {
                        enumerations.push(getAttribute(enumeration, "value"));
                     });
                  });
                  each(getByNameNS(type, XS_NAMESPACE,
                        "union"), function(node) {
                     each(getAttribute(node,
                           "memberTypes").split(/\s+/g), function(type) {
                        unions.push(parseRef(namespaces, node, type));
                     });
                  });
               }
               return filter({
                  attributes: attributes,
                  base: base,
                  elements: elements,
                  enumerations: enumerations,
                  maxOccurs: maxOccurs,
                  minOccurs: minOccurs,
                  unions: unions
               });
            }));
         });
         each(union, function(namespace) {
            if (!isUndefined(data.ports[namespace])) {
               var portNamespace = getPortNamespace(data, namespace);
               var portOperations = getPortOperations(data, namespace);
               operations.push(portOperations.map(function(name) {
                  var node = data.operations[portNamespace][name];
                  var input = getOperationElement(namespaces, data,
                        getByNameNS(node, WSDL_NAMESPACE, "input")[0]);
                  var output = getOperationElement(namespaces, data,
                        getByNameNS(node, WSDL_NAMESPACE, "output")[0]);
                  return [{
                     action:
                           getAttribute(data.actions[portNamespace][name],
                                 "soapAction"),
                     name: getAttribute(input, "name"),
                     type: parseRef(namespaces, input,
                           getAttribute(input, "type"))
                  }, {
                     type: parseRef(namespaces, output,
                           getAttribute(output, "type"))
                  }];
               }));
            } else {
               operations.push([]);
            }
         });
         return {
            namespaces: namespaces,
            operations: operations,
            services: services,
            types: types
         };
      }

      var SOAP_NAMESPACE = "http://schemas.xmlsoap.org/soap/envelope/";
      var WSDL_NAMESPACE = "http://schemas.xmlsoap.org/wsdl/";
      var XML_NAMESPACE = "http://www.w3.org/2000/xmlns/";
      var XS_NAMESPACE = "http://www.w3.org/2001/XMLSchema";
      var XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

      var implementation = {
         createHeaders: function(key, arr) {
            var operation = getOperation(key, arr);
            return {
               "SOAPAction": operation[INPUT_INDEX].action
            };
         },
         createOptions: function(serviceOptions, userOptions) {
            return merge({}, defaults, {
               init: function(key, options) {
                  return new Promise(function(resolve) {
                     resolve({
                        key: options.key,
                        props: {}
                     });
                  });
               },
               contentType: "text/xml",
               implementation: implementation,
               prefixes: {
                  xs: "http://www.w3.org/2001/XMLSchema"
               }
            }, serviceOptions, userOptions || {});
         },
         deserialize: function(key, arr, message) {
            var operation = getOperation(key, arr);
            var info = operation[OUTPUT_INDEX];
            var node = getFirstChild(getByNameNS(message,
                  SOAP_NAMESPACE, "Body")[0]);
            var result = implementation.deserializeObject(key, node, info);
            return result[keys(result)[0]];
         },
         deserializeError: function(key, message) {
            var detail = getByName(message, "detail")[0];
            var err = Error();
            err.name = getByName(message, "faultcode")[0].textContent;
            err.message = getByName(message, "faultstring")[0].textContent;
            if (!isUndefined(detail)) {
               var firstChild = getFirstChild(detail);
               var type = findTypeArr(getNamespaces(key),
                     firstChild.namespaceURI, firstChild.nodeName);
               err.info = implementation.deserializeObject(key,
                     firstChild, {type: type});
            }
            return err;
         },
         deserializeObject: function(key, data, info) {
            if (isNull(data.textContent)) {
               return undefined;
            }
            var xsiType = getAttribute(data, "xsi:type");
            var arr = (xsiType) ? getExtension(key, data, xsiType) : info.type;
            if (implementation.isBuiltInType(arr)) {
               return fromString(key, arr, data.textContent);
            } else {
               var result;
               var root = getTypeRoot(key, arr);
               var enumerations = getTypeEnumerations(key, arr);
               if (enumerations.length !== 0) {
                  result = data.textContent;
               } else if (implementation.isBuiltInType(root)) {
                  result = createInstance(key, arr);
                  result.value = fromString(key, root, data.textContent);
               } else {
                  result = createInstance(key, arr);
               }
               var type = getType(key, arr);
               each(getTypeElements(key, arr), function(el) {
                  var maxOccurs = el.maxOccurs || type.maxOccurs;
                  var unbounded = maxOccurs === "unbounded";
                  if (unbounded && !isArray(result) && !isUndefined(el.name)) {
                     result[el.name] = [];
                  }
                  each(data.childNodes, function(node) {
                     if (node.localName === el.name) {
                        var obj = implementation.deserializeObject(key,
                              node, el);
                        if (!isUndefined(obj)) {
                           if (unbounded) {
                              if (isArray(result)) {
                                 result.push(obj);
                              } else {
                                 result[el.name].push(obj);
                              }
                           } else {
                              result[el.name] = obj;
                           }
                        }
                     }
                  });
               });
               each(getTypeAttributes(key, arr), function(el) {
                  each(data.attributes, function(node) {
                     if (node.name === el.name) {
                        var enumerations = getTypeEnumerations(key, el.type);
                        if (implementation.isBuiltInType(el.type)) {
                           result[el.name] =
                                 fromString(key, el.type, node.value);
                        } else if (enumerations.length !== 0) {
                           result[el.name] = node.value;
                        } else {
                           result[el.name] = createInstance(key, el.type);
                           result[el.name].value = node.value;
                        }
                     }
                  });
               });
               return result;
            }
         },
         isArrayType: function(name) {
            return /^ArrayOf/.test(name);
         },
         isBuiltInType: function(arr) {
            return getNamespaceIndex(arr) === 0;
         },
         loadDefinitions: function(hostname, options) {
            var data = {
               actions: {},
               attributes: {},
               attributeGroups: {},
               bindings: {},
               elements: {},
               messages: {},
               operations: {},
               ports: {},
               types: {}
            };
            return Promise.all(options.definitions.map(function(definition) {
               return load(definition, hostname, options, data, {});
            })).then(function() {
               return processDefinition(data);
            });
         },
         parseResponse: function(req) {
            if (req.responseXML.querySelector) {
               return req.responseXML;
            } else {
               return xmlParser.parseFromString(req.responseText);
            }
         },
         serialize: function(key, arr, args) {
            var operation = getOperation(key, arr);
            var info = operation[INPUT_INDEX];
            var attributes = getTypeAttributes(key, info.type);
            var elements = getTypeElements(key, info.type);
            var obj;
            if (attributes.length !== 0) {
               obj = args[0];
            } else {
               obj = createInstance(key, info.type);
               each(elements, function(el, index) {
                  if (!isUndefined(args[index])) {
                     obj[el.name] = args[index];
                  }
               });
            }
            var envelope = createDocumentNS(SOAP_NAMESPACE, "Envelope");
            var message = envelope.documentElement;
            setAttributeNS(message, XML_NAMESPACE, "xmlns:xsi", XSI_NAMESPACE);
            var body = createElementNS(SOAP_NAMESPACE, "Body");
            appendChild(appendChild(message, body),
                  implementation.serializeObject(key, obj, info.name, info));
            return envelope;
         },
         serializeObject: function(key, obj, tag, info) {
            var objectArr = getObjectArr(key, obj.constructor);
            if (isUndefined(objectArr)) {
               throw Error("Unknown type");
            }
            var element;
            if (!isUndefined(info)) {
               var arr = info.type;
               element = createElementNS(getNamespaceName(key, arr), tag);
               if (getNamespaceIndex(objectArr) !== getNamespaceIndex(arr) ||
                  getNameIndex(objectArr) !== getNameIndex(arr)) {
                  var namespace = getObjects(key)[getNamespaceName(key, arr)];
                  if (!isUndefined(namespace) &&
                        !(getTypeName(key, arr) === "anyType" ||
                              obj instanceof getObject(key, arr))) {
                     throw Error("Unexpected object type");
                  }
                  setAttributeNS(element, XSI_NAMESPACE, "xsi:type",
                        getTypeName(key, objectArr));
               }
            } else {
               element = createElementNS(getNamespaceName(key, objectArr), tag);
            }
            var any;
            var props = keys(obj);
            var type = getType(key, objectArr);
            each(getTypeElements(key, objectArr), function(el) {
               if (isUndefined(el.name)) {
                  any = el;
               } else {
                  var value = obj[el.name];
                  if ((isUndefined(value) && props.indexOf(el.name) === -1) ||
                        isNull(value)) {
                     var minOccurs = el.minOccurs || type.minOccurs;
                     if (minOccurs !== "0") {
                        throw Error("Required property not defined");
                     }
                  } else {
                     var objects = isArray(value) ? value : [value];
                     each(objects, function(elObj) {
                        var child, namespaceName;
                        if (!isObject(elObj) &&
                              implementation.isBuiltInType(el.type)) {
                           namespaceName = getNamespaceName(key, objectArr);
                           child = createElementNS(namespaceName, el.name);
                           appendChild(child,
                                 createTextNode(toString(key, el.type, elObj)));
                        } else {
                           var enumerations = getTypeEnumerations(key, el.type);
                           if (enumerations.length !== 0) {
                              if (enumerations.indexOf(elObj) === -1) {
                                 throw Error("Invalid enum value");
                              }
                              namespaceName = getNamespaceName(key, el.type);
                              child = createElementNS(namespaceName, el.name);
                              appendChild(child,
                                    createTextNode(elObj));
                           } else {
                              child = implementation.serializeObject(key,
                                    elObj, el.name, el);
                           }
                        }
                        appendChild(element, child);
                     });
                  }
                  props = props.filter(function(prop) {
                     return prop !== el.name;
                  });
               }
            });
            var anyAttribute;
            each(getTypeAttributes(key, objectArr), function(attr) {
               if (isUndefined(attr.name)) {
                  anyAttribute = attr;
               } else {
                  if ((isUndefined(obj[attr.name]) &&
                        props.indexOf(attr.name) === -1) ||
                           isNull(obj[attr.name])) {
                     if (attr.use === "required") {
                        throw Error("Required attribute not defined");
                     }
                  } else {
                     if (implementation.isBuiltInType(attr.type)) {
                        setAttribute(element, attr.name,
                              toString(key, attr.type, obj[attr.name]));
                     } else {
                        var enumerations = getTypeEnumerations(key, attr.type);
                        if (enumerations.indexOf(obj[attr.name]) === -1) {
                           throw Error("Invalid enum value");
                        }
                        setAttribute(element, attr.name, obj[attr.name]);
                     }
                     props = props.filter(function(prop) {
                        return prop !== attr.name;
                     });
                  }
               }
            });
            var root = getTypeRoot(key, objectArr);
            if (implementation.isBuiltInType(root)) {
               appendChild(element,
                     createTextNode(toString(key, root, obj.value)));
               props.splice(props.indexOf("value"), 1);
            }
            if (!isUndefined(any)) {
               var maxOccurs = any.maxOccurs || type.maxOccurs;
               if (maxOccurs !== "unbounded" &&
                     props.length > parseInt(maxOccurs)) {
                  throw Error("Unnecessary property specified");
               }
               each(props, function(prop) {
                  var objects = isArray(obj[prop]) ? obj[prop] : [obj[prop]];
                  each(objects, function(propObj) {
                     appendChild(element,
                           implementation.serializeObject(key, propObj, prop));
                  });
               });
               props = [];
            }
            if (!isUndefined(anyAttribute)) {
               each(props, function(prop) {
                  setAttribute(element, prop,toString(key,
                        getObjectArr(key, obj[prop].constructor), obj[prop]));
               });
               props = [];
            }
            if (props.length > 0) {
               throw Error("Unnecessary property specified");
            }
            return element;
         },
         serializeRequest: function(message) {
            return xmlSerializer.serializeToString(message).replace(
                  "<Envelope xmlns=\"" + SOAP_NAMESPACE + "\">",
                  "<Envelope xmlns=\"" + SOAP_NAMESPACE + "\" " +
                  "xmlns:xs=\"" + XS_NAMESPACE + "\" " +
                  "xmlns:xsi=\"" + XSI_NAMESPACE + "\">"
            );
         }
      };
      var xmlParser = new (isUndefinedType(typeof DOMParser) ?
            require("xmldom").DOMParser : DOMParser)();
      var xmlSerializer = new (isUndefinedType(typeof XMLSerializer) ?
            require("xmldom").XMLSerializer : XMLSerializer)();
      var xmlDocument = isUndefinedType(typeof document) ?
            xmlParser.parseFromString("<xml/>") : document;

      return implementation;
   }

   var NAMESPACE_INDEX = 0;
   var NAME_INDEX = 1;
   var INPUT_INDEX = 0;
   var OUTPUT_INDEX = 1;

   var defaults = {
      debug: false,
      proxy: false,
      proxyHeader: "vSphere-Target"
   };
   var metadata = {};
   var jsonRpcImplementation = createJsonRpcImplementation();
   var soapImplementation = createSoapImplementation();
   var storage = isUndefinedType(typeof localStorage) ?
         new (require("node-localstorage").LocalStorage)(require("path").
         join(".localStorage")) : localStorage;

   createExports({
      cisService: function(hostname, options) {
         return createService(hostname, jsonRpcImplementation.createOptions({
            definitions: [
               "com.vmware.cis",
               "com.vmware.cis.tagging",
               "com.vmware.content",
               "com.vmware.vcenter.ovf"
            ],
            endpoint: "/api",
            key: "cisService",
            prefixes: {
               cis: "com.vmware.cis",
               content: "com.vmware.content",
               ovf: "com.vmware.vcenter.ovf",
               tagging: "com.vmware.cis.tagging"
            }
         }, options));
      },
      srmService: function(hostname, options) {
         return createService(hostname, soapImplementation.createOptions({
            init: function(key, options, methods, objects) {
               var vim = objects["urn:vim25"];
               var srmPort = methods["urn:srm0Service"];
               var serviceInstance = vim.ManagedObjectReference({
                  type: "SrmServiceInstance",
                  value: "SrmServiceInstance"
               });
               return srmPort.retrieveContent(serviceInstance).
                     then(function(serviceContent) {
                        return {
                           props: {
                              serviceContent: serviceContent,
                              serviceInstance: serviceInstance
                           },
                           key: [options.key, serviceContent.about.version].
                                 join("/")
                        };
                     });
            },
            definitions: ["/srm-Service.wsdl"],
            endpoint: "/vcdr/extapi/sdk",
            key: "srmService",
            port: 9086,
            prefixes: {
               srm: "urn:srm0",
               srmPort: "urn:srm0Service",
               vim: "urn:vim25"
            }
         }, options));
      },
      stsService: function(hostname, options) {
         return createService(hostname, soapImplementation.createOptions({
            definitions: ["/sts/STSService?wsdl"],
            endpoint: "/sts/STSService",
            key: "stsService",
            prefixes: {
               del: "urn:oasis:names:tc:SAML:2.0:conditions:delegation",
               dsig: "http://www.w3.org/2000/09/xmldsig#",
               saml: "urn:oasis:names:tc:SAML:2.0:assertion",
               smle: "http://www.rsa.com/names/2009/12/std-ext/SAML2.0",
               smlp: "http://www.rsa.com/names/2010/04/std-prof/SAML2.0",
               stsPort: "http://docs.oasis-open.org/ws-sx/ws-trust/200512/wsdl",
               wsa: "http://www.w3.org/2005/08/addressing",
               wsse: "http://docs.oasis-open.org/wss/2004/01/" +
                     "oasis-200401-wss-wssecurity-secext-1.0.xsd",
               wst13: "http://docs.oasis-open.org/ws-sx/ws-trust/200512",
               wst14: "http://docs.oasis-open.org/ws-sx/ws-trust/200802",
               wsta: "http://www.rsa.com/names/2009/12/std-ext/" +
                     "WS-Trust1.4/advice",
               wsu: "http://docs.oasis-open.org/wss/2004/01/" +
                     "oasis-200401-wss-wssecurity-utility-1.0.xsd"
            }
         }, options));
      },
      vimService: function(hostname, options) {
         return createService(hostname, soapImplementation.createOptions({
            init: function(key, options, methods, objects) {
               var vim = objects["urn:vim25"];
               var vimPort = methods["urn:vim25Service"];
               var serviceInstance = vim.ManagedObjectReference({
                  type: "ServiceInstance",
                  value: "ServiceInstance"
               });
               return vimPort.retrieveServiceContent(serviceInstance).
                     then(function(serviceContent) {
                        return {
                           props: {
                              serviceContent: serviceContent,
                              serviceInstance: serviceInstance
                           },
                           key: [
                              options.key + ":" + serviceContent.about.apiType,
                              serviceContent.about.version
                           ].join("/")
                        };
                     });
            },
            definitions: ["/sdk/vimService.wsdl"],
            endpoint: "/sdk",
            key: "vimService",
            prefixes: {
               vim: "urn:vim25",
               vimPort: "urn:vim25Service"
            }
         }, options));
      }
   });

})();
