//We must test the ability to generate genotypes, force parents, and create valid offspring according to the schema

var assert = require('assert');
var should = require('should');
var colors = require('colors');
var Q = require('q');

var util = require('util');

var winphylogeny = require('..');
var wMath = require('win-utils').math;
var uuid = require('win-utils').cuid;
var winback = require('win-backbone');

var backbone, generator, backEmit, backLog;
var evoTestEnd;
var count = 0;

var emptyModule = 
{
	winFunction : "test",
	eventCallbacks : function(){ return {}; },
	requiredEvents : function() {
		return [
        "phylogeny:fullAncestry",
        "phylogeny:buildTreeOfArtifacts",
        "phylogeny:partialAncestry"
			];
	}
};

describe('Testing win-data for: ', function(){

    //we need to start up the WIN backend
    before(function(done){

    	//do this up front yo
    	backbone = new winback();


    	var exampleJSON = 
		{
            "win-data" : "win-data",
			"win-phylogeny" : winphylogeny,
			"test" : emptyModule
		};

		var configurations = 
		{
			"global" : {
                "server" : "http://localhost",
                "port" : "3000"
			},
            "win-data" : {
                logLevel : backbone.testing
            },
			"win-phylogeny" : {
				logLevel : backbone.testing
			}
		};

    	backbone.logLevel = backbone.testing;

    	backEmit = backbone.getEmitter(emptyModule);
    	backLog = backbone.getLogger({winFunction:"mocha"});
    	backLog.logLevel = backbone.testing;

    	//loading modules is synchronous
    	backbone.loadModules(exampleJSON, configurations);

    	var registeredEvents = backbone.registeredEvents();
    	var requiredEvents = backbone.moduleRequirements();
    		
    	backLog('Backbone Events registered: ', registeredEvents);
    	backLog('Required: ', requiredEvents);

    	backbone.initializeModules(function()
    	{
    		backLog("Finished Module Init");
 			done();
    	});

    });

    it('get all artifacts',function(done){
        var artType = "picArtifact";
        // var temporaryRequest = "http://localhost:3000/api/artifacts?artifactType=picArtifact&all=true&password=allplease";

        backEmit("phylogeny:fullAncestry", function(err, allFunction){

            if(err){
                done(new Error(err));
                return;
            }

           allFunction(artType, "allplease", function(err, artifacts)
           {
                if(err)
                    done(new Error(JSON.stringify(err)));
                else
                {
                    //shoudl have all artifacts
                    backLog("All arts: ".green, util.inspect(artifacts, false, 1));
                    backLog("Art count: ".cyan, artifacts.artifactCount);
                    done();

                }


           })

        })

    });

    it('get all the artifacts, arrange them',function(done){

        var artType = "picArtifact";
        // var temporaryRequest = "http://localhost:3000/api/artifacts?artifactType=picArtifact&all=true&password=allplease";

        //this is what the q library is for -- we don't need this cascading test, but oh well for now
        backEmit("phylogeny:fullAncestry", function(err, allFunction){

            if(err){
                done(new Error(err));
                return;
            }

           allFunction(artType, "allplease", function(err, artifacts)
           {
                if(err)
                    done(new Error(JSON.stringify(err)));
                else
                {
                    //shoudl have all artifacts
                    backLog("All arts: ".green, util.inspect(artifacts, false, 1));

                    backEmit("phylogeny:buildTreeOfArtifacts", artifacts, function(err, tree)
                    {
                        if(err){
                            done(new Error(JSON.stringify(err)));
                        }
                        else
                        {
                            //tell me the tree of life, please
                            backLog("Full tree: ".magenta, util.inspect(tree, false, 2));

                            done();
                        }
                    })



                }


           })

        })

    });

});







