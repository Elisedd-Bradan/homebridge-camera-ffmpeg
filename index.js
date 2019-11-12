var Accessory, Service, Characteristic, hap, UUIDGen;

var FFMPEG = require('./ffmpeg').FFMPEG;
var dgram = require('dgram');

module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory;
  hap = homebridge.hap;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-camera-ffmpeg-maio", "Camera-ffmpeg-maio", ffmpegPlatform, true);
}

function ffmpegPlatform(log, config, api) {
  var self = this;

  self.log = log;
  self.config = config || {};

  if (api) {
    self.api = api;

    if (api.version < 2.1) {
      throw new Error("Unexpected API version.");
    }

    self.api.on('didFinishLaunching', self.didFinishLaunching.bind(this));
  }
}

ffmpegPlatform.prototype.configureAccessory = function(accessory) {
  // Won't be invoked
}

ffmpegPlatform.prototype.didFinishLaunching = function() {
  var self = this;
  var videoProcessor = self.config.videoProcessor || 'ffmpeg';
  var interfaceName = self.config.interfaceName || '';

  if (self.config.cameras) {
    var configuredAccessories = [];

    var cameras = self.config.cameras;
    cameras.forEach(function(cameraConfig) {
      var cameraName = cameraConfig.name;
      var videoConfig = cameraConfig.videoConfig;

      if (!cameraName || !videoConfig) {
        self.log("Missing parameters.");
        return;
      }

      var uuid = UUIDGen.generate(cameraName);
      var cameraAccessory = new Accessory(cameraName, uuid, hap.Accessory.Categories.CAMERA);
      var cameraAccessoryInfo = cameraAccessory.getService(Service.AccessoryInformation);
      if (cameraConfig.manufacturer) {
        cameraAccessoryInfo.setCharacteristic(Characteristic.Manufacturer, cameraConfig.manufacturer);
      }
      if (cameraConfig.model) {
        cameraAccessoryInfo.setCharacteristic(Characteristic.Model, cameraConfig.model);
      }
      if (cameraConfig.serialNumber) {
        cameraAccessoryInfo.setCharacteristic(Characteristic.SerialNumber, cameraConfig.serialNumber);
      }
      if (cameraConfig.firmwareRevision) {
        cameraAccessoryInfo.setCharacteristic(Characteristic.FirmwareRevision, cameraConfig.firmwareRevision);
      }

      cameraAccessory.context.log = self.log;

      if (cameraConfig.motion) {

        var motion = new Service.MotionSensor(cameraName);
        cameraAccessory.addService(motion);
      }

      var cameraSource = new FFMPEG(hap, cameraConfig, self.log, videoProcessor, interfaceName);
      cameraAccessory.configureCameraSource(cameraSource);
      configuredAccessories.push(cameraAccessory);

		// foreach camera create control socket if needed
		self.createEventsSocket(cameraConfig);
    });

    self.api.publishCameraAccessories("Camera-ffmpeg-maio", configuredAccessories);
  }
};

// create udp server for sensor receiving
ffmpegPlatform.prototype.createEventsSocket = function(cameraConfig) {

	var self = this;

	if ( typeof(cameraConfig.eventport) != 'undefined' ) {

		if ( typeof(self.server) == "undefined" ) {

			self.log("Creating control socket on port: " + cameraConfig.eventport);
			var server = dgram.createSocket({type:"udp4"});
			server.bind(cameraConfig.eventport);

			server.on('message', (msg, rinfo) => {

				var realmsg = msg.toString("utf8");

				if ( typeof(cameraConfig.eventcode) != "undefined" ) {

					if ( realmsg.startsWith("0001|") && realmsg.substr(5).startsWith(cameraConfig.eventcode+"|") ) {

						var cmdmsg = realmsg.substr(6+cameraConfig.eventcode.length);

						var on = cmdmsg == "on" || cmdmsg == "1";
						self.getService(Service.MotionSensor).setCharacteristic(Characteristic.MotionDetected, (on ? 1 : 0));
					}
				}
			});

			server.on('error', (err) => {
				self.log("Socket error. Retrying connection: " + err);
				self.server = undefined;
				server.close();
				setTimeout(function () {
					self.createEventsSocket(cameraConfig);
				}, 5000);
			});

			self.server = server;
		}
	}
};
