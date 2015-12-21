"use strict";

var Router = require('koa-router');
var fs = require('fs');
var path = require('path');
var BaseActionClass = require('./Action');
var xml2js = require('xml2js');
var defaults = require('defaults');
var relativePath = process.cwd();
var routerMap = {};

function Wires(app,config) {
    var option = defaults(config,{
        relativePath: relativePath,
        supportHttpRestByPost:false,
        onAddMiddleware:function(){},
        onAddAction:function(){},
        onFinish:function(){}
    });
    relativePath = option.relativePath;
    if(!option.config)throw new Error('config xml path is required');
    var router = new Router();
    var methods = ['get', 'put', 'patch', 'post', 'delete'];
    var methodsFnMap = (function () {
        var map = {};
        methods.forEach(function (m) {
            map[m] = m.replace(/^\w/, function (w) {
                return 'do' + w.toUpperCase();
            })
        });
        return map;
    })();

    function onAction(info,router) {
        var resourceClass = require(path.join(relativePath,info.src));
        if(typeof resourceClass != 'function')return;
        var resource = new resourceClass();
        if(!(resource instanceof BaseActionClass))throw new TypeError('router class must be instanceof Action');
        var routerName = info.uri;
        if(!routerName){
            throw new Error(info.src+' has no uri');
        }
        methods.forEach(function (method) {
            var fnName = methodsFnMap[method];
            var fn = resource[fnName];
            var isOverride = BaseActionClass.prototype[fnName] !== fn;
            if (typeof fn == 'function' && isOverride) {
                var args = [routerName];
                args.add = function(fn){
                    args.push(function*(next){
                        resource.context = this;
                        return yield fn.bind(resource)(this,next);
                    })
                };

                if(option.supportHttpRestByPost && 'post'==method)args.add(httpMethodSupport(resource));
                var validateFn = resource['validate'];
                if (validateFn)args.add(validateFn);
                args.add(fn);
                var _route = router[method].apply(router, args);
                resource.onRouteCreate(_route);
                option.onAddAction(routerName,method,_route);
            }
        });
        if (resource.middleware) {
            router.use(routerName, resource.middleware);
            option.onAddMiddleware(routerName, resource.middleware);
        }
    }

    var routerList = parseConfig(readConfig(option.config));
    routerList.forEach(function(item){
        var router = item.router;
        routerMap[item.id] = router;
        item.action.forEach(function(action){
            onAction(action,router);
        });
        if(item.middleware){
            if(/^\[.+?]$/.test(item.middleware)){
                var array = JSON.parse(item.middleware);
                if(!Array.isArray(array))throw new TypeError('router middleware type be string or array');
                array.forEach(function(src,i){
                    array[i] = require(path.join(relativePath,src));
                });
                router.use(compose(array));
            }else {
                router.use(require(path.join(relativePath,item.middleware)));
            }
            option.onAddMiddleware(item.middleware);
        }
        app.use(router.routes()).use(router.allowedMethods());
    });
    option.onFinish(routerMap);
}

function parseConfig(config){
    var routes = config.wires;
    var srcDir = getAttr(routes,'path') || '';
    var routerList = [];
    routes.route.forEach(function(route,i){
        route.index = i;
        var routePrefix = getAttr(route,'name') || '';
        var router = new Router({prefix:routePrefix});
        var routerConfig = {router:router,id:getAttr(route,'id') || routePrefix,middleware:getAttr(route,'middleware'),action:[]};
        routerList.push(routerConfig);
        parseRouteAction(route,routerConfig);
    });
    return routerList;

    function parseRouteAction(route,routerConfig){
        route.action.forEach(function(item){
            if(!item.attrs.name)throw new Error('action name is required');
            if(!item.attrs.src)throw new Error('action src is required');
            routerConfig.action.push({
                uri:item.attrs.name,
                src:path.join(srcDir,item.attrs.src)
            })
        });
    }

    function getAttr(el,name){
        if(el && el.attrs){
            return el.attrs[name] || null;
        }
    }
}

/**
 * 使用post方式处理客户端不支持put、delete等http请求方式的问题
 * @param resource
 * @returns {*}
 */
function httpMethodSupport(resource){
    return function *(ctx,next){
        var args = arguments;
        var method = getMethodByBody(ctx.request);
        if(method){
            switch (method){
                case 'put':
                    yield resource.doPost.apply(this,args);
                    break;
                case 'delete':
                    yield resource.doDelete.apply(this,args);
                    break;
                case 'patch':
                    yield resource.doPatch.apply(this,args);
                    break;
                default:
                    this.throw(404,'Method not implement');
                    break;
            }
        }else {
            yield next;
        }
    };


    function getMethodByBody(request){
        if(!request || !request.body)return false;
        var method = request.body.fields ? request.body.fields['_method'] : request.body['_method'];
        if(!method || typeof method!='string')return false;
        return method.toLowerCase();
    }
}

function readConfig(configPath){
    var parser = new xml2js.Parser({explicitArray:false,attrkey:'attrs'});
    var xmlStr = fs.readFileSync(configPath,'utf-8');
    var config = null;
    parser.parseString(xmlStr,function(err,data){
        if(err)throw err;
        config = data;
    });
    return config;
}

function compose(middleware){
    return function *(next){
        var i = middleware.length;
        var prev = next || noop();
        var curr;

        while (i--) {
            curr = middleware[i];
            prev = curr.call(this, prev);
        }

        yield *prev;
    }
}
function *noop(){}

Wires.getRouterById = function(id){
    return routerMap[id] || null;
};
Wires.Action = BaseActionClass;

module.exports = Wires;