var request = require('request').defaults({jar:true});
var _ = require('lodash');
var exec = require('exec');
var fs = require('fs');
var path = require('path');
var Q = require('q');
var chalk = require('chalk')
var spawn = require('child_process').spawn
var mv = require('mv')

var inquirer = require("inquirer");


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
				payload: {
					email: email,
					password: password,
					serviceId: serviceId || 4654
				}
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


var downloadManager = (function(){
	var _files = [];
	var MC_BASEPATH = '/Users/guilherme/Media Center/Globo/'

	var start = function(){

		var file = _files.pop();

		var axel = spawn('axel', ['-n30', '-a', '-o' + '_temp/' + file.filename + file.extension, file.url]);
			axel.stdout.pipe(process.stdout);

			axel.on('exit', function(){
				mv('_temp/' + file.filename + file.extension, file.destination, {mkdirp: true}, function(){})
				if(_files.length) start(); //Start next
			})
	}

	var addFile = function(url, title, id){
		var date, episode, filename, destination;
		var extension = path.extname(url.split('?')[0]);
		var program = title.split('-')[0].trim()

		if(title.match(/[\d+\/]+/)) {
			date = title.match(/[\d+\/]+/).pop().split('/').reverse().join('-')
			episode = [program, date].join(' - ')
			filename = [episode, 'pt'+id].join(' - ')
			destination = path.join(MC_BASEPATH, program, episode, filename + extension)
		} else {
			episode = program;
			filename = program;
			destination = path.join(MC_BASEPATH, program, filename + extension)
		}

		_files.push({
			url: url,
			folder: title,
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
	var promises = [];

	inquirer.prompt({type: 'list', message: "Programa", name: 'program', choices: ['imperio', 'big-brother-brasil', 'other']}, function(answer) {
		if(answer.program == 'other') {
			inquirer.prompt({name: 'program', message: 'Slug'}, function(answer) {

			})
		} else {
			chooseEpisode(answer.program)
		}
	})

	function chooseEpisode(program) {
		globo.getIntegras(program).then(function(data){

			var choices = {};

			data.map(function(episode){
				choices[episode.titulo] = episode.url;
			})

			inquirer.prompt({type: 'list', message: "Episódio", name: 'episode', choices: _.keys(choices)}, function(answer) {
				var url = choices[answer.episode];
				processVideo(url)
			})

		})
	}

} else {
	processVideo(process.argv[2])
}

function processVideo(url) {
	globo.login('medeeiros@globo.com', 'dnamoris2')
		.then(function(){
			return url
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
										downloadManager.addFile(url, video.title, child.id)
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
									downloadManager.addFile(url, video.title, video.id)
								});

							promises.push(promise);
						}
					})
				}
			})

			return Q.allSettled(promises);
		})
		.then(downloadManager.start)
}

