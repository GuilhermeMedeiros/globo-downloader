var path = require('path');
var mkdirp = require('mkdirp');
var spawn = require('child_process').spawn

module.exports = (function(){
	var _files = [];

	var start = function(){
		var file = _files.pop();
		mkdirp(path.dirname(file.destination), function(){
			var axel = spawn('axel', ['-n30', '-a', '-o' + file.destination, file.url]);
				axel.stdout.pipe(process.stdout);

				axel.on('exit', function(){
					if(_files.length) {
						process.nextTick(start); //Start next
					}
				})
		})
	}

	var addFile = function(url, title, pt, resourceTitle){
		var date, episode, filename, destination;
		var extension = path.extname(url.split('?')[0]);
		var program = title.split('-')[0].trim()

		if(title.match(/[\d+\/]+/)) {
			date = title.match(/[\d+\/]+/).pop().split('/').reverse().join('-')
			episode = [program, date].join(' - ')
			filename = [episode, 'pt'+pt].join(' - ')
			destination = path.join(process.cwd(), episode, filename + extension)
		} else {
			episode = program;
			filename = program;
			destination = path.join(process.cwd(), filename + extension)
		}

		_files.push({
			url: url,
			extension: extension,
			filename: filename,
			destination: destination
		})

		return defer.promise;
	}

	return {
		addFile: addFile,
		start: start
	}

}())
