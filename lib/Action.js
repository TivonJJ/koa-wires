"use strict";

class Action{

    constructor(){
        this.onCreate();
    }

    onCreate(){

    }

    onRouteCreate(){

    }

    *doGet(ctx,next){
        ctx.throw(404,'Method not implement');
    }

    *doPost(ctx,next){
        ctx.throw(404,'Method not implement');
    }

    *doPut(ctx,next){
        ctx.throw(404,'Method not implement');
    }

    *doDelete(ctx,next){
        ctx.throw(404,'Method not implement');
    }

    *doPatch(ctx,next){
        ctx.throw(404,'Method not implement');
    }

    *validate(ctx,next){
        if(ctx.errors)ctx.throw(403,ctx.errors);
        yield next;
    }

}

module.exports = Action;
