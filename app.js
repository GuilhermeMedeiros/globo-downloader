var request = require('request').defaults({jar:true});
var _ = require('lodash');
var exec = require('exec');
var fs = require('fs');
var path = require('path');
var Q = require('q');
var chalk = require('chalk')

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
	var _downloading = [];
	var _progressInfo = {};

	var startDownload = function(url, folder, filename){
		var defer = Q.defer();
		var extension = path.extname(url.split('?')[0]);
			folder = folder.replace(/\//gi, '-').replace(/[\,]/gi, '')
			filename = filename.replace(/\//gi, '-').replace(/[\,]/gi, '')

		var destination = path.join(process.argv[3] || './', folder, filename + extension)
		var totalSize = 0;
		var downloaded = 0;
		var req = request.get(url);
			req.on('error', defer.reject);
			req.on('response', function(response){
				if(response.headers['content-length']) {

					totalSize = response.headers['content-length'];

					response.on('data', function (data) {
						downloaded += data.length
						_progressInfo[destination] = {
							downloaded: downloaded,
							totalSize: totalSize,
							destination: destination
						}
						defer.notify(_progressInfo[destination]);
					})

					response.on('end', function(){
						defer.resolve(destination)
						_.pull(_downloading, destination);
						logEnd(destination)
					})
				}
			})

		if (!fs.existsSync(path.dirname(destination))) {
			fs.mkdirSync(path.dirname(destination))
		}

		req.pipe(fs.createWriteStream(destination));
		_downloading.push(destination);
		logProgress();

		return defer.promise;
	}

	var logProgress = function(){
		if(_downloading.length > 0) {
			var hasProgress = false;

			_.each(_downloading, function(item){
				var progress = _progressInfo[item];
				if(hasProgress = progress){
					console.log(chalk.gray(progress.destination), parseFloat(progress.downloaded/progress.totalSize*100, 10).toFixed(2) + '%')
				}
			})

			if(hasProgress) console.log(chalk.gray('--------------'))

			setTimeout(logProgress, 500);
		}
	}

	var logEnd = function(destination){
		console.log(chalk.gray(destination), chalk.green('✓'))
	}

	return {
		startDownload: startDownload
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

		_.each(playlist.videos, function(video){
			if(video.children) {
				_.each(video.children, function(child){
					_.each(child.resources, function(resource){
						if(resource.height >= 720) {
							globo.getDownloadURL(child, resource).then(function(url){
								downloadManager.startDownload(url, video.title, child.title)
									.then(function(){
										//Finished
									}, function(error){
										console.log(error)
									})
							});
						}
					})
				})

			} else {
				_.each(video.resources, function(resource){
					if(resource.height >= 720) {
						globo.getDownloadURL(video, resource).then(function(url){
							downloadManager.startDownload(url, video.title, video.title)
								.then(function(){
									//Finished
								}, function(error){
									console.log(error)
								})
						});
					}
				})
			}
		})
	})
