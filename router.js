var url = require('url')
var Router = require('routes')
var router = new Router()
var _ = require('lodash')
var async = require('async')

exports.extension = function(server){

  router._methods = []

  router.methodProcessor = function(method, routepoint, processor){
    router._methods.push({method: method, routepoint: routepoint, processor: processor})
  }

  server.router = router

  server.pluginLoader.push(function(plugins, done){
    async.map(plugins, function(config, next){
        if(config.module.route) config.module.route(config.plugin, config.ops, next)
        else{ next('no routes') }
      }, function(err, results){
        //@TODO add error handling
        done()
    })
  })

  server.pipePoint('Route', function(request, remand){
    var parsed = url.parse(request.raw.request.url)
    var pathname = parsed.pathname

    var match = server.router.match(pathname)
    if(!match){
      //@TODO fix 404 handling
      request.reply('404')
      remand('404')
    }
    else{
      request.route = match
      match.fn(request, remand)
    }
  })

  server.route = function(route, plugin){
    //@TODO make routepoints extensible

    var self = this
    route.preHandler = route.preHandler || []
    route.postHandler = route.postHandler || []
    route.postDispatch = route.postDispatch || []

    var handler = route.handler

    if(plugin){
      route.preHandler = plugin._preHandler.concat(route.preHandler)
      route.postHandler = route.postHandler.concat(plugin._postHandler)
      route.postDispatch = route.postDispatch.concat(plugin._postDispatch)
    }

    var handlerRemand = function(request, remand){
      request.reply.remand = remand
      route.handler(request, request.reply)
    }

    //@TODO put remand array creation in a seperate module/method
    var handle = {'_handleRoute': handlerRemand}

    _.each(server.router._methods, function(config){
      var remands = config.processor(route[config.method])
      route[config.routepoint].push(remands)
    })

    var remands = route.postDispatch.concat(route.preHandler).concat(handle).concat(route.postHandler)
    remands = _.chain(remands).flatten(true).without(null, undefined).value()

    router.addRoute(route.path, compileRouteFn(server, remands, handler))
  }

  //@TODO figure out more elegent plugin extending
  server.Plugin.prototype.route = function(route){
    var self = this
    server.route(route, self)
  }

  server.Plugin.prototype._preHandler = []
  server.Plugin.prototype._postHandler = []
  server.Plugin.prototype._postDispatch = []
}

/**
  * Compiles a route handler given a route object (path and equip handler).
  * Returns closure to capture the prerequisites and equip handler
  **/
function compileRouteFn(server, remands, handler){
  //@TODO is it efficient to recreate the chain every request?
  return function(request, remand){
    var chain = new server.RemandChain(request, remands.slice(0), function(err){
      remand(null)
    })
    chain.run()
  }
}
