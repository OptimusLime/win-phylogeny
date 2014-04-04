var express = require('express');

var app = express();

app.use("/build", express.static( __dirname + "/../build"));
app.use(express.static(__dirname));

var rPort = Math.floor(Math.random()*65000);

app.listen(rPort, function()
{
	console.log('Listening on port: ' + rPort);

});


