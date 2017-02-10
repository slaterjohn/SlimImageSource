    'use strict';

    var electron = require('electron').remote;
    var {app, Menu, MenuItem, shell, BrowserWindow} = electron;

	var url = require('url')

    var fs = node('fs-extra');
    var imagemin = node('imagemin');
	var imageminJpegtran = require('imagemin-jpegtran');
	var imageminJpegoptim = require('imagemin-jpegoptim');
	var imageminPngquant = node('imagemin-pngquant');
	var imageminGifsicle = node('imagemin-gifsicle');
	var imageminSvgo = require('imagemin-svgo');
    var assign = node('object-assign');
    var path = node('path');
    var dropped = node('drag-drop');
    var each = node('each-async');
    var jszip = require("jszip");
    var FileSaver = require('file-saver');
    var toBlob = require('stream-to-blob');
    var moment = require('moment');

	var config = require('./config.json');

    var _zip_contents = [];
    var _zip_location;
	var _temporary_directory = app.getPath('temp') + "ImageCompressionApp";

	let aboutWindow

    /*
        1. Input files (drag and drop)
        2. Iterate over files
        3. Minify files
        4. Save files
        5. Update UI output list
    */

    /*
     *  Receive Files
     *  Accept the received files and interate them
     */
    var receive = function(files, cb){

        if(typeof files === "object"){
            // Convert to array
            files = Object.keys(files).map(function (key) { return files[key]; });
        }

        // Update UI with loading message
        working(true);

		// Direct the temp dir
		tmp_directory(function(dir){
			//_temporary_directory = dir;

			each(files, function (item, i, done){

	            // Compress this image
	            compress(item, function(){
	                zip_addFile(item);
	                done();
	            });

	        },
	        function(error){
	            if(error) console.log('error');
	            else {
	                working(false);
	                create_zip();
	            }
	        });

		});

    }





	/*
     *  Compress File
     *  Take a file and compress it
     */
    var compress = function(file, cb){
		var savePath = _temporary_directory + '/' + file.name;
		file.compressedPath = savePath;

        imagemin([file.path], {
		    plugins: [
		        imageminJpegtran({max: 80}),
		        imageminGifsicle({optimizationLevel: 3, interlaced: true}),
		        imageminPngquant({quality: '65-80', speed: 1, }),
				imageminSvgo()
		    ]
		}).then((buffer) => {
			fs.writeFile(savePath, buffer[0].data, (err) => {
            	if (err) throw err;
				cb(null, file);
            });
		});
    }





    /*
     *  Select files
     *  Deal with files when they are selected
     */
    var selectFiles = function(){
        var form = document.getElementsByClassName('images_form')[0];
        var input = form.getElementsByTagName('input')[0];

        // When field changes
        input.addEventListener('change', function(event){
            receive(
                event.target.files,
                function(){}
            );

        }, false);
    }





    /*
     *  Drop files
     *  Deal with files when they are dropped
     */
    var dropFiles = function(){

        dropped('.ui-drop-zone', function (files, pos) {

            receive(
                files,
                function(){}
            );

        });

    }





    /*
     *  Working
     *  Update UI to say you're working on an image
     */
    var working = function(isWorking){
        if(isWorking){
			showView(document.getElementsByClassName('ui-compressing-view')[0]);
        }
        else {
			showView(document.getElementsByClassName('ui-finished-view')[0]);
        }
    }






	/*
     *  Show View
     *  Show a specific view, hide others
     */
    var showView = function(view){
		var views = document.getElementsByClassName('ui-view');

		// Hide others
		for (var i = 0; i < views.length; i++) {
			addClass(views[i], 'u-hide');
		}

		// Show passed view
		removeClass(view, 'u-hide');
	}





    /*
     *  Create the temporary directory
     *  Will create a temporary directory if it doesn't exist already
     */
    var tmp_directory = function(cb){
		var directory = _temporary_directory;
        fs.ensureDir(directory, function (err) {
			console.log(err);
			cb(directory);
		});
    }





    /*
     *  Cleanup
     *  Will clear up the temporary directory, variables and interface
     */
    var cleanup = function(){
		_zip_contents = [];
        _zip_location = null;

		// fs.renameSync(_temporary_directory, _temporary_directory+'2');
		if(fs.existsSync(_temporary_directory)){
			fs.remove(_temporary_directory);
		}

		console.log('cleanup', _temporary_directory);
    }





	/*
     *  Add files to zip
     *  Add files to the zip files array
     */
    var zip_addFile = function(file){
        compare_size(file);
        _zip_contents.push(file);
    }





    /*
     *  Create new zip
     *  Compile files into a zip file
     */
    var create_zip = function(){
        var zip = new jszip();
        var files = _zip_contents;

        var currentTime = moment().format('YYYY-MM-DD-HH-mm-ss--X');

		var zipFilename = currentTime+'.zip';
		var zipPath = _temporary_directory;
		var zipSavePath = _temporary_directory + '/' + zipFilename;
        _zip_location = zipSavePath;

		// Add each file to the zip folder
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            zip.file(file.name, fs.readFileSync(file.compressedPath));
        }

        // Save the zip folder
        zip.generateAsync({
            type: 'nodebuffer'
        }).then(function(content) {
            fs.writeFile(_zip_location, content, (err) => {
              if (err) throw err;

              // Finish up
              finish();
            });
        });

    }




    /*
     *  Compare file sizes
     *  Get the size details of a resized file
     */
    var compare_size = function(file){
        var before = fs.statSync(file.path).size;
        var after = fs.statSync(file.compressedPath).size;
        var difference = (after < before)? before-after : 0;

        var percentage_saved = (1 - (after/before)) * 100;
        percentage_saved = Math.round(percentage_saved*100)/100;

        var compare_obj = {
            "before": before,
            "after": after,
            "difference": difference,
            "percentage_saved": percentage_saved
        }

        file.smashed = compare_obj;

        return compare_obj
    }





    /*
     *  Total difference
     *  The work is done, now to finish
     */
    var total_difference = function(){
        var files = _zip_contents;
        var before = 0;
        var after = 0;

        for (var i = 0; i < files.length; i++) {
            before += files[i].smashed.before;
            after += files[i].smashed.after;
        }

        var difference = (after < before)? before-after : 0;
        var percentage_saved = (1 - (after/before)) * 100;
        percentage_saved = Math.round(percentage_saved*100)/100;

        return {
            "before": before,
            "after": after,
            "difference": difference,
            "percentage_saved": percentage_saved
        }

    }





    /*
     *  Show saved amount
     *  Display how much the images have been reduced
     */
    var display_reduced = function(dif){
        var reduced_element_title = document.getElementsByClassName('js-total-saved-title')[0];
        var reduced_element_subtitle = document.getElementsByClassName('js-total-saved-subtitle')[0];
        var difference = dif.percentage_saved;
        var innerElement = document.createElement('span');

        reduced_element_title.innerHTML = null;
        reduced_element_subtitle.innerHTML = null;

        if(difference == 0){
            reduced_element_title.innerText = config["messages"]["none"]["title"].replace("[DIFFERENCE]", difference);
            reduced_element_subtitle.innerText = config["messages"]["none"]["subtitle"];
        }

        else if(difference < 10){
            reduced_element_title.innerText = config["messages"]["bad"]["title"].replace("[DIFFERENCE]", difference);
            reduced_element_subtitle.innerText = config["messages"]["bad"]["subtitle"];
        }

        else if(difference < 50){
            reduced_element_title.innerText = config["messages"]["good"]["title"].replace("[DIFFERENCE]", difference);
            reduced_element_subtitle.innerText = config["messages"]["good"]["subtitle"];
        }

        else if(difference >= 50){
            reduced_element_title.innerText = config["messages"]["super"]["title"].replace("[DIFFERENCE]", difference);
            reduced_element_subtitle.innerText = config["messages"]["super"]["subtitle"];
        }

        display_reduced_icon(difference);
    }




    /*
     *  Show icon
     *  Show the icon that best expresses the savings made
     */
    var display_reduced_icon = function(amount){
        var icon = document.getElementsByClassName('js-total-saved-icon')[0];
        if(amount == 0) icon.src = config["icons"]["none"];
        else if(amount < 10) icon.src = config["icons"]["bad"];
        else if(amount < 50) icon.src = config["icons"]["good"];
        else if(amount >= 50) icon.src = config["icons"]["super"];
    }





    /*
     *  Finish Up
     *  The work is done, now to finish
     */
    var finish = function(file){
        var smashed_size = total_difference();
        display_reduced(smashed_size);

        // Update zip link
        document.getElementsByClassName('js-save-all')[0].href = _zip_location;

    }




	/*
     *  Swap Gifs
     *  Keep swapping the gifs in the compressing view
     */
    var startGifs = function(){
		var gifs = config.gifs;
		var currentGif = 1;
		var gifElement = document.getElementsByClassName('ui-compressing-view__gif')[0];

		var nextGif = function(current){
			var next = randomNumber(0, gifs.length);
			return (current == next)? nextGif(current) : next;
		}

		setInterval(function(){
			var nextGifNumber = nextGif(currentGif);
			gifElement.src = gifs[nextGifNumber];
			currentGif = nextGifNumber;
		}, 1000);


    }





    /*
     *  Start over button
     *  Keep swapping the gifs in the compressing view
     */
    var startOverButton = function(){
        var link = document.getElementsByClassName('js-start-over')[0];

        // When field changes
        link.addEventListener('click', function(event){
            cleanup();
            showView(document.getElementsByClassName('ui-welcome-view')[0]);
        }, false);
    }




	/*
     *  Random Number
     *  Return number between two values
     */
    var randomNumber = function(a, b){
		return Math.floor(Math.random() * b) + a;
	}





	/*
     *  Open About
     *  Open and configure the about window
     */
    var openAbout = function(a, b){
		aboutWindow = new BrowserWindow({
			width: 400,
			height: 400,
			titleBarStyle: 'default',
			resizable: false,
			fullscreen: false,
			title: 'About Image Smasher'
		});

		// and load the about.html of the app.
		aboutWindow.loadURL(url.format({
			pathname: path.join(__dirname, 'about.html'),
			protocol: 'file:',
			slashes: true
		}));

        // Open dev tools
        if(config.devMode){
            aboutWindow.webContents.openDevTools({mode: 'undocked'});
        }
	}





    // Run
    selectFiles();
    dropFiles();
    startGifs();
    startOverButton();
	cleanup();









    /*
        https://github.com/imagemin/imagemin
        https://github.com/oliver-moran/jimp
        http://electron.atom.io/docs/api/file-object/
        https://stuk.github.io/jszip/documentation/api_jszip.html
        https://www.npmjs.com/package/fs-extra
        https://nodejs.org/api/fs.html#fs_fs_readfilesync_file_options
        https://github.com/electron/electron/blob/master/docs/api/app.md
        https://github.com/electron/electron/blob/master/docs/api/remote.md
    */





	function hasClass(el, className) {
	  if (el.classList)
	    return el.classList.contains(className)
	  else
	    return !!el.className.match(new RegExp('(\\s|^)' + className + '(\\s|$)'))
	}

	function addClass(el, className) {
	  if (el.classList)
	    el.classList.add(className)
	  else if (!hasClass(el, className)) el.className += " " + className
	}

	function removeClass(el, className) {
	  if (el.classList)
	    el.classList.remove(className)
	  else if (hasClass(el, className)) {
	    var reg = new RegExp('(\\s|^)' + className + '(\\s|$)')
	    el.className=el.className.replace(reg, ' ')
	  }
	}




	// Move to main
	var buildMenu = function(){
		var menu = new Menu();

		// App Sub Items
		var AppMenuItems = new Menu();

		// About
		AppMenuItems.append( new MenuItem({
			label: 'About Image Smasher',
			click(){
				openAbout();
			}
		}));

		// Divider
		AppMenuItems.append( new MenuItem({type: 'separator'}));

		// Quit
		AppMenuItems.append( new MenuItem({
			label: 'Quit',
			role: 'quit'
		}));

		// Help Menu
		var HelpMenuItems = new Menu();
		HelpMenuItems.append( new MenuItem({label: 'Support Site', click(){
			shell.openExternal('http://imagesmasher.interactiveinception.com');
		}}));

		// Main Menu
		var AppMenu = new MenuItem({label: 'Image Smasher', submenu: AppMenuItems});
		var HelpMenu = new MenuItem({label: 'Help', submenu: HelpMenuItems});

		menu.append(AppMenu);
		menu.append(HelpMenu);
		// menu.append( new MenuItem({label: 'MenuItem1', click() { console.log('item 1 clicked') }}) );

		Menu.setApplicationMenu(menu);
	}

	//app.on('ready', buildMenu)
	buildMenu();
