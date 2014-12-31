// var cheerio = require('cheerio');
var request = require('request').defaults({jar:true});
var _ = require('lodash');
var exec = require('exec');
var fs = require('fs');
var progress = require('download-status');
var path = require('path');


request.post({
	url: 'https://login.globo.com/api/authentication',
	headers: {
		'Content-Type': 'application/json'
	},
	body: {
		email: 'medeeiros@globo.com',
		password: 'dnamoris2',
		serviceId: 4654
	},
	json: true

}, function(error, response, html){

	request.get({
		url: 'http://globotv.globo.com/-/upa/watch_later/?per_page=100',
	}, function(error, response, body){
		if(!error){
			var data = JSON.parse(body);

			// data.data.forEach(function(item){})

			// http://api.globovideos.com/videos/3844687/playlist/
			// data.data[0].metadata.url_for_consumption
			//http://security.video.globo.com/videos/3844687/hash?resource_id=3844687_wmsm&version=2.9.9.65&udid=null&player=html5


			//http://voddownload03.globo.com/v0/01/86/4f/3842637_4f7e8bec8c9dc37d30090697149df44082f63641/3842637-web720.mp4?h=05021419935524945211522214200219244524761019N22VtuKupwVdBlJAzVpS6w&k=flash offline
			//http://voddownload03.globo.com/v0/01/86/4f/3842637_4f7e8bec8c9dc37d30090697149df44082f63641/3842637-web720.mp4?h=0214199354187912524696K6xASAXzUkmg93HXui4qqQ&k=flash node
			//http://voddownload03.globo.com/v0/01/86/4f/3842637_4f7e8bec8c9dc37d30090697149df44082f63641/3842637-web720.mp4?h=021419935677638573169414200220774344107476TSfDyBvS1WHlOnCZkn2VHg&k=flash //original
			//http://voddownload03.globo.com/v0/01/86/4f/3842637_4f7e8bec8c9dc37d30090697149df44082f63641/3842637-web720.mp4?h=05021420034035172546262014200376354598391001BDqVyeDetVa1nzWG4fAuBw&k=flash //python signed



			_.each(data.data, function(watch_later){

				request.get({
					url: "http://api.globovideos.com/videos/"+watch_later.resource_id+"/playlist/"
				}, function(error, response, body){

					var playlist = JSON.parse(body);

					_.each(playlist.videos, function(video){

						if(video.children) {
							_.each(video.children, function(child){
								_.each(child.resources, function(resource){
									if(resource.height >= 720) {
										downloadResource(children, resource);
									}
								})
							})

						} else {
							_.each(video.resources, function(resource){
								if(resource.height >= 720) {
									downloadResource(video, resource);
								}
							})
						}



					})

				})

			})

		}
	})
})



function downloadResource(video, resource) {
	console.log(video.id);
	console.log(resource._id);

	request.get({
		// url: "http://security.video.globo.com/videos/"+video.id+"/hash?resource_id="+resource._id+"&version=2.9.9.65&udid=null&player=html5"
		url: "http://security.video.globo.com/videos/"+video.id+"/hash?resource_id="+resource._id+"&version=2.9.9.65&player=html5"
	}, function(error, response, body){

		console.log(response.body)

		var hash = (JSON.parse(body)).hash;

		exec(['python', 'hash.py', hash], function(err, out, code){
			console.log(out);

			hash = out.slice(2, -3)
			var qs = resource.query_string_template.replace('{{hash}}', hash).replace('{{key}}', 'html5')
			var url = resource.url + '?' + qs;


			var req = request.get({url: url});

				req.on('response', function(res){
					progress()(res, url, function(){
						//Finished
					})
				})

				req.on('error', function(err){
					console.log(err)
				})

				req.pipe(fs.createWriteStream(path.basename(resource.url)));

			// console.log(resource)
			// console.log(hash)
			// console.log(url)
		})

	})
}
