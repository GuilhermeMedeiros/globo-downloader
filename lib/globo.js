var Q = require('q');
var request = require('request').defaults({jar:true});
var exec = require('exec');

module.exports = (function(){

	var getHash = function(videoID, resourceID){
		var defer = Q.defer()

		request.get({
			url: "http://security.video.globo.com/videos/"+ videoID +"/hash?resource_id="+resourceID+"&version=2.9.9.92&player=html5"
		}, function(error, response, body){
			if(error){
				defer.reject(error)
			} else {
				var data = JSON.parse(body);

				if(data.hash) {
					defer.resolve(data.hash);
				} else {
					defer.reject(data.message);
				}

			}
		})

		return defer.promise;
	}

	var getSignedHash = function(hash){
		var defer = Q.defer()

		exec(['python', __dirname + '/hash.py', hash], function(err, out, code){
			if(err || !out || out.length < 5) {
				defer.reject('Impossible to generate signed hash')
			} else {
				defer.resolve(out.slice(2, -3))
			}
		})
		return defer.promise;
	}

	var login = function(email, password, serviceId){
		var defer = Q.defer()

		request.post({
			url: 'https://login.globo.com/api/authentication',
			headers: {
				'Content-Type': 'application/json'
			},
			body: {
				payload: {
					email: email,
					password: password,
					serviceId: serviceId || 4654
				}
			},
			json: true

		}, function(error, response, data){
			if(error){
				defer.reject(error);
			} else if (data.id === 'Authenticated') {
				defer.resolve(response);
			} else {
				defer.reject(data.id);
			}
		})

		return defer.promise;
	}

	var getPlaylist = function(videoID){
		var defer = Q.defer()

		request.get("http://api.globovideos.com/videos/"+videoID+"/playlist/", function(error, response, body){
			if(error){
				defer.reject(error);
			} else {
				defer.resolve(JSON.parse(body));
			}
		})

		return defer.promise;
	}

	var getIDFromURL = function(url){
		return url.match(/\/(\d+)\/?$/)[1];
	}

	var getDownloadURL = function(video, resource){
		return getHash(video.id, resource._id)
			.then(getSignedHash)
			.then(function(signedHash){
				var qs_template = resource.query_string_template || 'h={{hash}}&k={{key}}';
				var qs = qs_template.replace('{{hash}}', signedHash).replace('{{key}}', 'html5')

				return resource.url + '?' + qs;
			})
	}

	var getIntegras = function(slug){
		var defer = Q.defer()

		request.get("http://globotv.globo.com/rede-globo/"+slug+"/integras.json", function(error, response, body){
			if(error){
				defer.reject(error);
			} else {
				defer.resolve(JSON.parse(body));
			}
		})

		return defer.promise;
	}

	return {
		getSignedHash: getSignedHash,
		login: login,
		getPlaylist: getPlaylist,
		getIDFromURL: getIDFromURL,
		getDownloadURL: getDownloadURL,
		getIntegras: getIntegras
	}

}())
