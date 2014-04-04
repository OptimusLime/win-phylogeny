//this will help us navigate complicated json tree objects
var traverse = require('optimuslime-traverse');

module.exports = winphylogeny;

function winphylogeny(backbone, globalConfig, localConfig)
{
	var self= this;

	//need to make requests, much like win-publish
	//pull in backbone info, we gotta set our logger/emitter up
	var self = this;

	self.winFunction = "phylogeny";

	//this is how we talk to win-backbone
	self.backEmit = backbone.getEmitter(self);

	//grab our logger
	self.log = backbone.getLogger(self);

	//only vital stuff goes out for normal logs
	self.log.logLevel = localConfig.logLevel || self.log.normal;

	//we have logger and emitter, set up some of our functions

	//what events do we need?
	//none for now, though in the future, we might have a way to communicate with foreign win-backbones as if it was just sending
	//a message within our own backbone -- thereby obfuscating what is done remotely and what is done locally 
	self.requiredEvents = function()
	{
		return [
			"data:winGET"
		];
	}

	//what events do we respond to?
	self.eventCallbacks = function()
	{ 
		return {
			"phylogeny:fullAncestry" : self.fullAncestry,
			//for now, partial == full -- for now
			"phylogeny:partialAncestry" : self.fullAncestry,
			"phylogeny:fullTreeOfArtifacts" : self.getFullTreeOfArtifacts,
			"phylogeny:buildTreeOfArtifacts" : self.buildTreeOfArtifacts
		};	
	}

	self.fullAncestry = function(finished)
	{
		//
		self.log("WARNING: calling full phylogeny might be dangerously consuming for the server. Therefore, this is a two step function." + 
			" I give you a function, you call the function. ");
		self.log("In the future, there will be an authorization password for doing this. This will deter accidents for now");

		//send it back -- no error
		finished(undefined, self.internalFullPhylogeny);
	}

	self.internalFullPhylogeny = function(artifactType, password, finished)
	{
		//query all artifacts from our server -- use a password please
		self.backEmit("data:winGET", "/artifacts", {artifactType: artifactType, all: true, password: password}, function(err, res){
			
			if(err)
			{
				finished(err);
				return;
			}
			else if(res.statusCode == 500 || res.statusCode == 404)
			{
				finished("Server full phylogeny failure: " + JSON.stringify(res.error) + " | message: " + err.message);
				return;
			}
			//there is an implicit assumption here that there aren't complicated parent child relationships here -- like 1 to 1 
			//uh oh for iesor?

			var artifacts = res.body;

			var childrenToParents = {};
			var parentsToChildren = {};

			var childrenParentCount = {};
			var parentChildrenCount = {};

			var widArtifacts = {};
			
			//this is for main artifacts
			for(var i=0; i < artifacts.length; i++)
			{
				var aChild = artifacts[i];
				var aWID = aChild.wid;
				var parents = aChild.parents;

				//a simple mapping from artifactWID to object
				widArtifacts[aWID] = aChild;

				var c2pObject = childrenToParents[aWID];
				if(!c2pObject)
				{
					c2pObject = {};
					childrenParentCount[aWID] = parents.length;
					childrenToParents[aWID] = c2pObject;
				}
				var p2cObject;
				for(var p=0; p < parents.length; p++)
				{
					var aParWID = parents[p];
					//now we map children to parents
					p2cObject = parentsToChildren[aParWID]; 
					if(!p2cObject)
					{
						p2cObject = {};
						parentChildrenCount[aParWID] = 0;
						parentsToChildren[aParWID] = p2cObject;
					}

					//now we have all information here
					//the child object marks the parent object
					c2pObject[aParWID] = true;

					//the parent object marks the child wid as a child
					p2cObject[aWID] = true;

					//increment the child count
					parentChildrenCount[aParWID]++;
				}

				//now we know all the parents for this artifact, and all the parents know this is a child
			}

			finished(undefined, {
				artifacts :  widArtifacts,
				parentsToChildren: parentsToChildren, 
				childrenToParents: childrenToParents, 
				artifactCount: artifacts.length, 
				childrenParentCount: childrenParentCount
			});

		});
	}

	//grab the full tree
	self.getFullTreeOfArtifacts = function(finished)
	{
		self.log("WARNING: calling full phylogeny/artifact tree might be dangerously consuming for the server. Therefore, this is a two step function. I give you a function, you call the function. ");
		self.log("In the future, there will be an authorization password for doing this. This will deter accidents for now");

		//send it back -- no error
		finished(undefined, self.internalFullTree);
	}
	self.internalFullTree = function(artifactType, password, finished)
	{
		//two step process, grab phylo info, then work on the tree
		self.internalFullPhylogeny(artifactType, password, function(err, artStuff)
		{
			if(err)
			{
				finished(err);
				return;
			}

			self.buildTreeOfArtifacts(artStuff, function(err, tree)
			{
				//if we have an err, it'll be passed on anyways
				finished(err, tree);
			});
		});
	}

	//we build up a full tree here
	self.buildTreeOfArtifacts = function(artObject, finished)
	{
		//got all these artifcats yo
		var artifacts = artObject.artifacts;
		var parentsToChildren  = artObject.parentsToChildren;
		var childrenToParents = artObject.childrenToParents;
		var artifactCount = artObject.artifactCount;
		var childrenParentCount = artObject.childrenParentCount;

		//so we know who is root by how many parents they have
		// self.log("C2PCount: ", childrenParentCount);

		var minChildren = Number.MAX_VALUE;
		//get the minimum
		for(var key in childrenParentCount)
			minChildren = Math.min(minChildren, childrenParentCount[key]);
	
		self.log("Minimum children among arts: " , minChildren);
		//let's follow the chain, and build a tree of sorts
		//at the top are the roots
		var root = {};
		for(var key in childrenParentCount)
		{
			//these are root objects -- they don't have any parents!
			if(childrenParentCount[key] == minChildren)
				root[key] = {};
		}

	
		//let's turn this tree into numbers, and the appropriate mapping for each artifact
		//first we'll go by layers -- mapping objects to lyaers

		//we need a real list of layers
		function recursiveTrueLayers(layer, wid, trueLayers, p2c)
		{
			var layerInfo = trueLayers[wid];

			//looking for layer info for children after we set
			//we set each object EVERY time we see it -- but do not investigate those already checked
			if(layerInfo)
				return;

			//otherwise, we don't exist!
			layerInfo = {layer: layer};
			//make it part of our object
			trueLayers[wid] = layerInfo;

			//all done with that, lets check our children and their parents!
			var children = p2c[wid];

			//making our job easy, nothing to do here
			if(!children)
				return;

			var childLayer = layerInfo.layer + 1;

			//loop through our children
			for(var widChild in children)
			{
				//look at our children, their layers are the max of our layer + 1
				recursiveTrueLayers(childLayer, widChild, trueLayers, p2c);

				//it must exist
				var clObject = trueLayers[widChild];

				//either its the current layer -- or the original layer determined (whichever is greater)
				clObject.layer = Math.max(clObject.layer, childLayer); 
			}
		}

		//we need things with the proper dependencies
		var artifactsToLayers = {};
		var layersToArtifacts = {};

		//starting from root -- find true layering info by recursively examining children
		for(var wid in root)
		{
			var startLayer = 0;
			recursiveTrueLayers(startLayer, wid, artifactsToLayers, parentsToChildren);
		}

		//appropriate layers
		for(var wid in artifactsToLayers)
		{
			//grab the layer
			var layer = artifactsToLayers[wid].layer;

			//grab the existing layer
			var layer2Art = layersToArtifacts[layer]; 
			if(!layer2Art)
 			{
 				layer2Art = {};
 				layersToArtifacts[layer] = layer2Art;
			}

			//layer to objects
			layer2Art[wid] = artifacts[wid];
		}

		//now we have layers of objects
		self.log("Artifacts to layers: ", layersToArtifacts);

		var buildNames = {};
		var links = [];

		//we now have all the info needed to name something
		var fullTreeNames = {};


		//because it's in layers, it is guaranteed to be in order of the tree of dependencies
		//that is, every child can reference a parent and the naming will be done by induction
		for(var layer in layersToArtifacts)
		{	
			var lCount = 0;
			for(var wid in layersToArtifacts[layer])
			{
				var artifact = layersToArtifacts[layer][wid];

				//what's the base -- the layer, and count of object
				var baseName = [layer, lCount++].join('-');

				//now we need to note our parents by their layer ids 
				var name =  {base: baseName, parents: []};
				
				//parents? Everyone is at least an empty array
				var parents = Object.keys(childrenToParents[wid]);

				for(var i=0; i < parents.length; i++)
				{
					//grab our parent ids
					var pWID = parents[i];
					name.parents.push(buildNames[pWID].base);
				}

				//now we have everything we need in name
				name.fullName = name.base + (name.parents.length ? "_p_" + name.parents.join('_') : "");
				name.artifact = artifact;

				//need to link parent and child
				for(var i=0; i < parents.length; i++)
				{	
					var pWID = parents[i];
					links.push({source: buildNames[pWID].fullName, target: name.fullName});
				}

				//all done, we have naming info
				buildNames[wid] = name;	

				//we have all we need for full names
				fullTreeNames[wid] = name.fullName;
			}
		}

		//have build identification
		//yeah boyeee
		//send back what we know about the tree stuffff
		finished(undefined, {nameTree: fullTreeNames, artifacts: artifacts, links: links});
	}

	self.recursiveFollowChildren = function(layer, wid, build, p2c, alreadyInvestigated, treeProperties)
	{
		//grab our potential children (might not exist)
		var children = p2c[wid];

		//this is the child of the build object -- everything must make one!
		build[wid] = {layer: layer};

		//how deep do we go???
		treeProperties.maxLayer = Math.max(treeProperties.maxLayer, layer);

		//still counts!
		treeProperties.totalCount++;

		//this object ain't got no children
		if(!children)
		{
			//no children, mark as leaf, count leaves, peace!
			treeProperties.leafCount++;

			//we're the end of the line -- here we simple store something?
			build[wid].isLeaf = true;

			return;
		}
		
		//these are all the children we need to investigate
		var investigate = Object.keys(children);	
		
		//otherwise we have to investigate all our children -- no duplicates please
		for(var i=0; i < investigate.length; i++)
		{	
			var iWID = investigate[i];

			//make sure not to fall into infinite recursion -- the worst way to die 
			if(!alreadyInvestigated[iWID])
			{
				//mark as seen
				alreadyInvestigated[iWID] = true;

				//how many non leafs do we have?
				treeProperties.nonLeafCount++;

				//keep building!
				self.recursiveFollowChildren(layer + 1, iWID, build[wid], p2c, alreadyInvestigated, treeProperties);
			}
			else
			{
				//we have seen this already, we have a cycle
				treeProperties.hasCycle = true;
				if(!treeProperties.cycle)
					treeProperties.cycle = {};

				//grab all the objects responsible for causing a cycle -- this can affect layers later
				treeProperties.cycle[iWID] = true;

			}			
		}
	}

	return self;
}






