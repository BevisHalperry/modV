/*jslint browser: true */

// map() from Processing
Math.map = function(value, low1, high1, low2, high2) {
	return low2 + (high2 - low2) * (value - low1) / (high1 - low1);
};

// from here: http://stackoverflow.com/questions/5223/length-of-a-javascript-object-that-is-associative-array
Object.size = function(obj) {
	var size = 0, key;
	for (key in obj) {
		if (obj.hasOwnProperty(key)) size++;
	}
	return size;
};

// based on: http://stackoverflow.com/questions/6116474/how-to-find-if-an-array-contains-a-specific-string-in-javascript-jquery
Array.contains = function(needle, arrhaystack) {
	return (arrhaystack.indexOf(needle) > -1);
};

// Get HTML document request
window.getDocument = function(url, callback) {
	var xhr = new XMLHttpRequest();

	xhr.onload = function() {
		callback(xhr.responseXML);
	};

	xhr.open("GET", url);
	xhr.responseType = "document";
	xhr.send();
};

window.forIn = function(item, filter) {
	for(var name in item) {
		if(item.hasOwnProperty(name)) {
			filter(name, item[name]);
		}
	}
};

navigator.getUserMedia = navigator.getUserMedia 		||
						 navigator.webkitGetUserMedia	||
						 navigator.mozGetUserMedia		||
						 navigator.msGetUserMedia		||
						 navigator.oGetUserMedia;

var modV = function(options) {

	console.log('      modV Copyright  (C)  2016 Sam Wray      '+ "\n" +
				'----------------------------------------------'+ "\n" +
				'      modV is licensed  under GNU GPL V3      '+ "\n" +
				'This program comes with ABSOLUTELY NO WARRANTY'+ "\n" +
				'For details, see http://localhost:3131/LICENSE'+ "\n" +
				'----------------------------------------------');

	var self = this,
		aCtx, // Audio Context
		analyser, // Analyser Node 
		microphone;

	self.version = "1.2b";

	// Load user options
	if(typeof options !== 'undefined') self.options = options;

	self.options.user = "please set username";

	self.clearing = true;
	if(!self.options.clearing) self.clearing = false;

	if(!self.options.headless) {
		self.headless = false;
		self.options.headless = false;
	} else {
		self.headless = true;
	}

	if(!self.options.controlDomain) self.options.controlDomain = location.protocol + '//' + location.host;

	self.baseURL = self.options.baseURL || '';

	// Attach message handler for sockets and windows
	self.addMessageHandler();

	self.gainNode = null;
	self.meydaSupport = false;

	self.modOrder = [];
	self.moduleStore = {};
	self.registeredMods = {};
	self.activeModules = {};

	self.video = document.createElement('video');
	self.video.autoplay = true;
	self.video.muted = true;

	self.canvas = self.options.canvas || document.createElement('canvas');
	self.context = self.canvas.getContext('2d');

	self.soloCanvas = undefined;

	self.meydaSupport = false;
	self.muted = true;

	self.ready = false;

	// Clipboard store
	self.copiedValue = null;

	// Robots
	self.bots = {};

	// WebSocket
	self.ws = undefined;

	// UI Templates
	self.templates = document.querySelector('link[rel="import"]').import;

	// Set name
	self.setName = function(name) {
		self.options.user = name;
		self.saveOptions();
	};

	// Window resize
	self.resize = function() {
		self.THREE.renderer.setSize(self.previewCanvas.width, self.previewCanvas.height);

		forIn(self.activeModules, (mod, Module) => {
			if('resize' in Module) {
				if(Module instanceof self.Module3D) {
					Module.resize(self.previewCanvas, Module.getScene(), Module.getCamera(), self.THREE.material, self.THREE.texture);
				} else {
					Module.resize(self.previewCanvas, self.previewCtx);	
				}
			}
		});
	};

	self.mainWindowResize = function() {

		// set canvas size
		var boundingRect = self.canvas.getBoundingClientRect();
		self.canvas.width = boundingRect.width;
		self.canvas.height = boundingRect.height;
	};

	window.addEventListener('resize', self.mainWindowResize);

	// Create canvas
	self.setCanvas = function(el) {
		if(el.nodeName !== 'CANVAS') {
			console.error('modV: setCanvas was not supplied with a CANVAS element.');
			return false;
		}
		self.canvas = el;
		self.context = el.getContext('2d');

		return true;
	};

	if(self.options.canvas) {
		self.setCanvas(self.options.canvas);
	}

	// Create Windows
	self.createWindows();

	// Collection of palette controls
	self.palettes = [];

	self.presets = {};

	self.profiles = {};

	self.mediaManager = new WebSocket("ws://localhost:3132/");

	self.mediaManager.onerror = function() {
		console.warn('Media Manager not available - did you start modV in no-manager mode?');
	};

	self.mediaManagerAvailable = false;
	
	self.mediaManager.onopen = function() {
		console.info('Media Manager connected, retriveing media list');
		self.mediaManager.send(JSON.stringify({request: 'update'}));
		self.mediaManagerAvailable = true;
	};

	self.mediaManager.onmessage = function(m) {
		var parsed = JSON.parse(m.data);

		console.log('Media Manager says:', parsed);

		if('type' in parsed) {
			switch(parsed.type) {
				case 'update':
					self.profiles = parsed.payload;
					self.mediaSelectors.forEach(function(ms) {
						ms.update(self.profiles);
					});

					var arr = [];
					forIn(self.profiles, profile => {
						arr.push(profile);
					});

					self.palettes.forEach(function(palette) {
						palette.updateProfiles(self.profiles);
					});
				break;
			}
		}
	};

	self.loadPreset = function(id) {
		//self.factoryReset();

		self.presets[id].modOrder.forEach((mod, idx) => {
			var presetModuleData = self.presets[id].moduleData[mod];
			var Module;

			Module = new self.moduleStore[presetModuleData.originalModuleName]();

			var originalModule = self.registeredMods[presetModuleData.originalName];

			Module.info.originalModuleName = originalModule.info.originalModuleName;
			
			Module.info.name = presetModuleData.name;
			Module.info.originalName = presetModuleData.originalName;
			Module.info.safeName = presetModuleData.safeName;

			// init Module
			if(Module instanceof self.ModuleShader) {
				Module.programIndex = originalModule.programIndex;
				
				// Loop through Uniforms, expose self.uniforms and create local variables
				if('uniforms' in Module.settings.info) {

					forIn(Module.settings.info.uniforms, (uniformKey, uniform) => {
						switch(uniform.type) {
							case 'f':
								Module[uniformKey] = parseFloat(uniform.value);
								break;

							case 'i':
								Module[uniformKey] = parseInt(uniform.value);
								break;

							case 'b':
								Module[uniformKey] = uniform.value;
								break;

						}
					});
				}
			}

			// init Module
			if('init' in Module && Module instanceof self.Module2D) {
				Module.init(self.previewCanvas, self.previewCtx);
			}

			if('init' in Module && Module instanceof self.Module3D) {
				Module.init(self.previewCanvas, Module.getScene(), Module.getCamera(), self.THREE.material, self.THREE.texture);
			}

			// Set Module values
			Module.info.disabled = presetModuleData.disabled;
			Module.info.blend = presetModuleData.blend;
			Module.info.solo = presetModuleData.solo;

			forIn(presetModuleData.values, value => {
				Module[value] = presetModuleData.values[value];
			});

			// Create UI controls
			self.createControls(Module, self);

			// Add to active modules
			self.activeModules[Module.info.name] = Module;

			// Set mod Order
			self.setModOrder(Module.info.name, idx);

			var activeItemNode = self.createActiveListItem(Module, function(node) {
				self.currentActiveDrag = node;
			}, function() {
				self.currentActiveDrag  = null;
			});

			var list = document.getElementsByClassName('active-list')[0];
			list.appendChild(activeItemNode);
		});
	};

	self.savePreset = function(name, profile) {
		var preset = {
			modOrder: self.modOrder,
			moduleData: {},
			presetInfo: {
				datetime: Date.now(),
				modVVersion: self.version,
				author: self.options.user
			}
		};
		
		function extractValues(Control) {
			preset.moduleData[mod].values[Control.variable] = Module[Control.variable];
		}

		for (var i=0; i < self.modOrder.length; i++) {
			var mod = self.modOrder[i];

			var Module = self.activeModules[mod];
			
			preset.moduleData[mod] = {};
			preset.moduleData[mod].disabled = Module.info.disabled;
			preset.moduleData[mod].blend = Module.info.blend;
			preset.moduleData[mod].name = Module.info.name;
			preset.moduleData[mod].clone = false;
			preset.moduleData[mod].originalName = Module.info.originalName;
			preset.moduleData[mod].safeName = Module.info.safeName;
			preset.moduleData[mod].originalModuleName = Module.info.originalModuleName;
			preset.moduleData[mod].solo = Module.info.solo;

			if('originalName' in Module.info) {
				preset.moduleData[mod].clone = true;
			}

			preset.moduleData[mod].values = {};
			Module.info.controls.forEach(extractValues);
		}
		
		self.presets[name] = preset;
		localStorage.setItem('presets', JSON.stringify(self.presets));
		console.info('Wrote preset with name:', name, 'in profile', profile, preset);

		if(self.mediaManagerAvailable) {
			self.mediaManager.send(JSON.stringify({
				request: 'save-preset',
				profile: profile,
				payload: preset,
				name: name
			}));
		}
	};

	self.meydaFeatures = ['complexSpectrum'];

	self.addMeydaFeature = function(feature) {
		if(!Array.contains(feature, self.meydaFeatures)) {
			self.meydaFeatures.push(feature);
			return true;
		} else return false;
	};

	// Check for Meyda
	if(typeof window.Meyda === 'object') {
	//if(typeof window.Meyda === 'function') {
		self.meydaSupport = true;
		console.info('meyda detected, expanded audio analysis available.');
	}

	self.bpm = 0;
	self.bpmHold = false;
	self.bpmHeldAt = 120;
	// Check for BeatDetektor
	if(typeof window.BeatDetektor === 'function') {
		self.beatDetektorSupport = true;
		console.info('BeatDetektor detected, BPM analysis available.', 'modV robot now available.');
		self.beatDetektorMed = new BeatDetektor(85,169);

		self.beatDetektorKick = new BeatDetektor.modules.vis.BassKick();
		self.kick = false;
	}

	// Check for THREE
	if(typeof window.THREE === 'object') {
		console.info('THREE.js detected.', 'Revision:', THREE.REVISION);
		self.THREE = {};

		self.THREE.texture = new THREE.Texture(self.previewCanvas);
		self.THREE.texture.minFilter = THREE.LinearFilter;

		self.THREE.material = new THREE.MeshBasicMaterial({
			map: self.THREE.texture,
			side: THREE.DoubleSide
		});

		self.THREE.soloTexture = new THREE.Texture(self.soloCanvas);
		self.THREE.soloTexture.minFilter = THREE.LinearFilter;

		self.THREE.soloMaterial = new THREE.MeshBasicMaterial({
			map: self.THREE.soloTexture,
			side: THREE.DoubleSide
		});

		self.THREE.renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: true
		});
		self.THREE.renderer.setPixelRatio( window.devicePixelRatio );

		self.THREE.canvas = self.THREE.renderer.domElement;
	}

	// Lookup presets
	if(!localStorage.getItem('presets')) {
		localStorage.setItem('presets', JSON.stringify({}));
	} else {
		self.presets = JSON.parse(localStorage.getItem('presets'));
		forIn(self.presets, presetname => {
			//self.addPresetToController(presetname, self.options.controlDomain);
			console.log('Successfuly read saved preset with name:', presetname);
		});
	}

	/* Save modV's config to local storage */
	self.saveOptions = function() {
		localStorage.setItem('modVoptions', JSON.stringify(self.options)); 
	};

	/* Load modV's config to local storage */
	self.loadOptions = function(callback) {
		if(localStorage.getItem('modVoptions')) {
			var loadedOptions = JSON.parse(localStorage.getItem('modVoptions'));
			forIn(loadedOptions, key => {
				if(!(key in self.options)) {
					self.options[key] = loadedOptions[key];
				}
			});
		}

		if(callback) callback();
	};

	// Shader handling
	self.shaderEnv = {};
	self.shaderSetup();

	self.start = function() {

		// Load Options
		self.loadOptions(function() {

			// Scan Stream sources and setup User Media
			scanMediaStreamSources(function(foundSources) {

				var audioSource;
				var videoSource;

				foundSources.audio.forEach(function(audioSrc) {
					if(audioSrc.id === self.options.audioSource) {
						audioSource = audioSrc.id;
					}
				});

				foundSources.video.forEach(function(videoSrc) {
					if(videoSrc.id === self.options.videoSource) {
						videoSource = videoSrc.id;
					}
				});

				self.setMediaSource(audioSource || foundSources.audio[0].id, videoSource || foundSources.video[0].id);
				if(!self.headless) self.startUI();
			});
			

			
			if(typeof self.canvas !== 'object') {
				console.error('modV: Canvas not set');
				return false;
			}

			if(self.options.remote && !self.remoteSuccess) {
				self.initSockets();

				console.log('Remote server not connected yet, waiting for connection to start.');
				setTimeout(self.start, 1000);
			} else {

				// if(self.options.remote) {
				// 	forIn(self.registeredMods, mod => {
				// 		var infoToSend = JSON.parse(JSON.stringify(self.registeredMods[mod].info)); // copy the set
				// 		var variables = [];

				// 		if('controls' in self.registeredMods[mod].info) {
				// 			self.registeredMods[mod].info.controls.forEach(function(controlSet) {
				// 				var variable = controlSet.variable;
				// 				variables.push(variable);
				// 			});

				// 			variables.forEach(function(v) {
				// 				infoToSend[v] = self.registeredMods[mod][v];
				// 			});
				// 		}

				// 		self.ws.send(JSON.stringify({
				// 			type: 'register',
				// 			payload: infoToSend
				// 		}));
				// 	});
				// }

				requestAnimationFrame(self.loop.bind(self)); //modV-drawLoop.js //TODO: figure out why we're using bind (I get it, but seems stupid)
			}
		});
	};

	/* Usermedia access */

	// Store all available Media inputs
	self.mediaStreamSources = {
		video: [],
		audio: []
	};

	function scanMediaStreamSources(callback) {

		MediaStreamTrack.getSources(function(sources) {
			
			self.mediaStreamSources.video = [];
			self.mediaStreamSources.audio = [];

			sources.forEach(function(source) {

				if(source.kind === 'audio') {
					self.mediaStreamSources.audio.push(source);
				} else {
					self.mediaStreamSources.video.push(source);
				}

			});
			if(callback) callback(self.mediaStreamSources);
		});

	}

	// Create function to use later on
	self.rescanMediaStreamSources = function(callback) {
		scanMediaStreamSources(callback);
	};

	self.setMediaSource = function(audioSourceID, videoSourceID) {
		var constraints = {
			audio: {
				optional: [
					{googNoiseSuppression: false},
					{googEchoCancellation: false},
					{googEchoCancellation2: false},
					{googAutoGainControl: false},
					{googNoiseSuppression2: false},
					{googHighpassFilter: false},
					{googTypingNoiseDetection: false},
					{sourceId: audioSourceID}
				]
			}
		};

		/* If there is a video stream source, add the video permission */
		if(self.mediaStreamSources.video.length > 0) {
			constraints.video = {
				optional: [
					{googNoiseSuppression: false},
					{googEchoCancellation: false},
					{googEchoCancellation2: false},
					{googAutoGainControl: false},
					{googNoiseSuppression2: false},
					{googHighpassFilter: false},
					{googTypingNoiseDetection: false},
					{sourceId: videoSourceID}
				]
			};
		}

		self.options.audioSource = audioSourceID;
		self.options.videoSource = videoSourceID;
		self.saveOptions();

		/* Ask for user media access */
		navigator.getUserMedia(constraints, userMediaSuccess, userMediaError);
	};

	function userMediaSuccess(stream) {

		// Create video stream
		self.video.src = window.URL.createObjectURL(stream);
		
		// If we have opened a previous AudioContext, destroy it as the number of AudioContexts
		// are limited to 6
		if(aCtx) aCtx.close();

		// Create new Audio Context
		aCtx = new window.AudioContext();
		
		// Create new Audio Analyser
		analyser = aCtx.createAnalyser();
		
		// Create a gain node
		self.gainNode = aCtx.createGain();
		
		// Mute the node
		self.gainNode.gain.value = 0;
		
		// Create the audio input stream (audio)
		microphone = aCtx.createMediaStreamSource(stream);

		// Connect the audio stream to the analyser (this is a passthru) (audio->(analyser))
		microphone.connect(analyser);
		
		// Connect the audio stream to the gain node (audio->(analyser)->gain)
		microphone.connect(self.gainNode);
		
		// Connect the gain node to the output (audio->(analyser)->gain->destination)
		self.gainNode.connect(aCtx.destination);
		
		// If meyda is about, use it
		if(self.meydaSupport) {
			self.meyda = new Meyda.createMeydaAnalyzer({
				audioContext: aCtx,
				source: microphone,
				bufferSize: 512
			});
			//self.meydaInst = new Meyda(aCtx, microphone, 512);
			//self.meyda = Meyda;
		}
		
		// Tell the rest of the script we're all good.
		self.ready = true;
	}

	function userMediaError() {
		console.log('Error setting up WebAudio - please make sure you\'ve allowed modV access.');
	}

};

module.exports = modV;
window.modV = modV;