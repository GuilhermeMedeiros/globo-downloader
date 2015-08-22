var fs = require('fs');
var path = require('path');

var homeDir = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
var CREDENTIAL_FILENAME = '.globo_credentials';

module.exports = (function(){

	var getCredentials = function(){
		return JSON.parse(fs.readFileSync(path.join(homeDir, CREDENTIAL_FILENAME).toString()));
	}

	var hasCredentials = function(){
		return fs.existsSync(path.join(homeDir, CREDENTIAL_FILENAME));
	}

	var saveCredentials = function(email, password){
		return fs.writeFile(path.join(homeDir, CREDENTIAL_FILENAME), JSON.stringify({
			email: email,
			password: password
		}, null, 4))
	}


	return {
		getCredentials: getCredentials,
		hasCredentials: hasCredentials,
		saveCredentials: saveCredentials
	}

}())
