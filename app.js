var request = require('request').defaults({jar:true});
var _ = require('lodash');
var exec = require('exec');
var fs = require('fs');
var path = require('path');
var Q = require('q');
var chalk = require('chalk')
var spawn = require('child_process').spawn
var mv = require('mv')


var globo = (function(){

	var getHash = function(videoID, resourceID){
		var defer = Q.defer()

		request.get({
			url: "http://security.video.globo.com/videos/"+ videoID +"/hash?resource_id="+resourceID+"&version=2.9.9.65&player=html5"
		}, function(error, response, body){
			if(error){
				defer.reject(error)
			} else {
				var data = JSON.parse(body);
				defer.resolve(data.hash);
			}
		})

		return defer.promise;
	}

	var getSignedHash = function(hash){
		var defer = Q.defer()

		exec(['python', 'hash.py', hash], function(err, out, code){
			if(err || !out || out.length < 5) {
				defer.reject()
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
				email: email,
				password: password,
				serviceId: serviceId || 4654
			},
			json: true

		}, function(error, response){
			if(error){
				defer.reject(error);
			} else {
				defer.resolve(response);
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

	return {
		getSignedHash: getSignedHash,
		login: login,
		getPlaylist: getPlaylist,
		getIDFromURL: getIDFromURL,
		getDownloadURL: getDownloadURL
	}

}())


var downloadManager = (function(){
	var _files = [];

	var start = function(){

		var file = _files.pop();

		var axel = spawn('axel', ['-n30', '-a', '-o' + file.filename + file.extension, file.url]);
			axel.stdout.pipe(process.stdout);

			axel.on('exit', function(){
				mv(file.filename + file.extension, file.destination, {mkdirp: true})
				if(_files.length) start(); //Start next
			})

	}

	var addFile = function(url, folder, filename){
		var extension = path.extname(url.split('?')[0]);
			folder = folder.replace(/\//gi, '-').replace(/[\,]/gi, '').trim()
			filename = filename.replace(/\//gi, '-').replace(/[\,]/gi, '').trim()

		var destination = path.join(process.argv[3] || './', folder, filename + extension)

		_files.push({
			url: url,
			folder: folder,
			filename: filename,
			destination: destination,
			extension: extension
		})

		return defer.promise;
	}


	return {
		addFile: addFile,
		start: start
	}

}())


if(!process.argv[2]) {
	return console.log('URL not defined');
}

globo.login('medeeiros@globo.com', 'dnamoris2')
	.then(function(){
		return process.argv[2]
	})
	.then(globo.getIDFromURL)
	.then(globo.getPlaylist)
	.then(function(playlist){

		var promises = [];

		_.each(playlist.videos, function(video){
			if(video.children) {
				_.each(video.children, function(child){
					_.each(child.resources, function(resource){
						if(resource.height >= 720) {
							var promise = globo.getDownloadURL(child, resource);
								promise.then(function(url){
									downloadManager.addFile(url, video.title, child.title)
								});

							promises.push(promise);
						}
					})
				})

			} else {
				_.each(video.resources, function(resource){
					if(resource.height >= 720) {
						var promise = globo.getDownloadURL(video, resource);
							promise.then(function(url){
								downloadManager.addFile(url, video.title, video.title)
							});

						promises.push(promise);
					}
				})
			}
		})

		return Q.allSettled(promises);
	})
	.then(downloadManager.start)
