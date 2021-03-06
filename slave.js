





var sensorController = (function () {
  var W1Temp = require('w1temp');
  var mqtt = require('mqtt');
  var mqttClient;
  var mdns = require('mdns');
  var brokerAddress;
  // THE FOLLOWING ARE THE AUTHENTICATION CREDENTIALS FOR THE MQTT BROKER
  // CHANGE THESE IF DIFFERENT CREDENTIALS ARE DESIRED.  REMEMBER TO ALSO CHANGE THESE IN THE MASTER. 
  var brokerUsername = 'still';
  var brokerPassword = 'pi';
  var connectToBroker = true;
  var sensorIDs = [];
  var sensorControllers = [];
 
  var condenserSensors = {
    '28-02184030d4ff': 'dephleg', 
    '28-0118410d7eff': 'product'
  };




  var sensorHandler = function (temperature) {
    var num = this.file.split('/').length - 2;
    const id = this.file.split('/')[num]
    console.log('Sensor UID:', id, 'Temperature: ', temperature.toFixed(3), '°C   ');
    
    if (id in condenserSensors) {
      mqttClient.publish('stillpi/condenser/report', JSON.stringify({ 'sensorid': condenserSensors[id], 'value': temperature.toFixed(3), units: 'C'}), 
        (err, granted) => {
          if (typeof err !== "undefined") {
            console.log("err: ", err);
          };
          if (typeof granted !== "undefined") {
            console.log("granted: ", granted);
          }
        });
    } else {
      mqttClient.publish('stillpi/sensors/report', JSON.stringify({ 'sensorid': id, 'value': temperature.toFixed(3), units: 'C'}), 
        (err, granted) => {
          if (typeof err !== "undefined") {
            console.log("err: ", err);
          };
          if (typeof granted !== "undefined") {
            console.log("granted: ", granted);
          }
        });
    }
  };


  var mqttMessageHandler = function (topic, message) {
    console.log( '  sensorController:mqttMessageHandler:topic: ', topic);
    console.log( '  sensorController:mqttMessageHandler:message: ', message.toString('utf8'));
    // Dispatch messages to the relevant handler.  
    switch (topic) {
      case 'stillpi/sensors/identify/invoke':
        console.log('Temperature sensor announce message recieved.');
	      var sensorClass = JSON.parse(message.toString('utf8')).class;
        if (sensorClass === 'all' || sensorClass === 'temperature') {
            console.log('Announcing sensors.');
            announceSensors('sensors');
        }
        break;

      case 'stillpi/sensors/ping':
        var pingMessageType = JSON.parse(message.toString('utf8')).type;
        // console.log("Ping message type: ", pingMessageType);

        if (pingMessageType === 'call') {
          var pingSensorID = JSON.parse(message.toString('utf8')).sensorid;
          // var pingSensorID = message.sensorid;
          // console.log('Ping for sensor: ', pingSensorID);
          if (sensorIDs.includes(pingSensorID)) {
            console.log('Responding to ping on sensor: ', pingSensorID);
            mqttClient.publish('stillpi/sensors/ping', JSON.stringify({'type': 'response', 'sensorid': pingSensorID}), 
              (err, granted) => {
                if (typeof err !== "undefined") {
                  console.log("err: ", err);
                };
                if (typeof granted !== "undefined") {
                  console.log("granted: ", granted);
                }
              });
          }
        } 
        // else {
        //   console.log("Skipping ping response message.", JSON.parse(message.toString('utf8')), (pingMessageType === 'call'));
        // }
      break;

      case 'stillpi/condenser/identify/invoke':
        console.log('Condenser temperature sensor announce message recieved.');
	      var sensorClass = JSON.parse(message.toString('utf8')).class;
        if (sensorClass === 'all' || sensorClass === 'temperature') {
            console.log('Announcing condenser sensors.');
            announceSensors('condenser');
        }
        break;

      case 'stillpi/condenser/ping':
        var pingMessageType = JSON.parse(message.toString('utf8')).type;
        var pingMessage = JSON.parse(message.toString('utf8'));
        // console.log("Ping message: ", pingMessage);

        if (pingMessageType === 'call') {
          var pingSensorID = JSON.parse(message.toString('utf8')).sensorid;
          // var pingSensorID = message.sensorid;
          // console.log('Ping for sensor: ', pingSensorID, "  ", condenserSensors,  "  ", !(Object.keys(condenserSensors).find(key => condenserSensors[key] === pingSensorID) === ''));
          // Object.keys(object).find(key => object[key] === value)
          if (!(Object.keys(condenserSensors).find(key => condenserSensors[key] === pingSensorID) === '')) {  // This tests to see if this module is configured to be a condenser temperature sensor.  
            // console.log('Responding to ping on sensor: ', pingSensorID);
            mqttClient.publish('stillpi/condenser/ping', JSON.stringify({'type': 'response', 'sensorid': pingSensorID}), 
              (err, granted) => {
                if (typeof err !== "undefined") {
                  console.log("err: ", err);
                };
                if (typeof granted !== "undefined") {
                  console.log("granted: ", granted);
                }
              });
          }
        } 
        // else {
        //   console.log("Skipping ping response message.", JSON.parse(message.toString('utf8')), (pingMessageType === 'call'));
        // }
        break;
    }
  };


  var announceSensors = function (type) {

    if (typeof sensorIDs !== "undefined") {
      console.log("ANNOUNCE SENSORS");
    }

    sensorIDs.forEach( (sensor, index) => {
      if ((sensor in condenserSensors) && (type === 'condenser)')) {  
        publishSensor( 'condenser', sensor, index);
      } else if (!(sensor in condenserSensors) && (type === 'sensor)')) {
        publishSensor( 'sensors', sensor, index);
      }
    });

      console.log("Announcing completed.");
  };

  const publishSensor = function (type, sensor, index) {

    console.log('Announcing: ', sensor, "MQTT broker connected: ", mqttClient.connected);
    var temp = sensorControllers[index].getTemperature();
    console.log("Sensor: ", sensor, ", temperature: ", temp);
    mqttClient.publish('stillpi/' + type + '/identify/announce', JSON.stringify({ 'sensorid': sensor, 'class' : 'temperature', value: sensorControllers[index].getTemperature(), units: 'C'}), 
      (err, granted) => {
        if (typeof err !== "undefined") {
          console.log("err: ", err);
        };
        if (typeof granted !== "undefined") {
          console.log("granted: ", granted);
        }
      });
};


  return {
    init: function () {
      console.log('Initializing sensor controller.');

      // Find MQTT broker IP address.  
      console.log('Searching for MQTT broker.');
      // This next line is required on Raspberry Pi per:
      //   https://github.com/agnat/node_mdns/issues/130
      mdns.Browser.defaultResolverSequence[1] = 'DNSServiceGetAddrInfo' in mdns.dns_sd ? mdns.rst.DNSServiceGetAddrInfo() : mdns.rst.getaddrinfo({families:[4]});
      var browser = mdns.createBrowser(mdns.tcp('mqtt'));
      browser.on('serviceUp', function(service) {
        console.log("MQTT service found. Name: ", service.name);
        if (service.name === 'stillpi' && connectToBroker) {
          connectToBroker = false;
          brokerAddress = 'mqtt://' + service.addresses[0];
          console.log('Connecting to MQTT broker.')
          //Setup the MQTT client that this sensor controller uses to receive sensor data from the master.  
          var options = {
            username: brokerUsername,
            password: Buffer.alloc(brokerPassword.length, brokerPassword) // Passwords are buffers
          } 
          console.log('Broker address: ', brokerAddress);
          console.log('Credentials: ', options);
          mqttClient  = mqtt.connect(brokerAddress, options);
          // Subscribe to relevant topics.  
          mqttClient.on('connect', function () {
            browser.stop() // You have the broaker, stop browsing.  
            console.log('Connected to MQTT broker.')
            mqttClient.subscribe('stillpi/sensors/identify/invoke');
            mqttClient.subscribe('stillpi/sensors/ping');
            mqttClient.subscribe('stillpi/condenser/identify/invoke');
            mqttClient.subscribe('stillpi/condenser/ping');
            announceSensors();
          }); 
          mqttClient.on("error",function(error){
            console.log("MQTT connection error");
          });
          // Setup handler to dispatch incoming MQTT messages.  
          mqttClient.on('message', mqttMessageHandler);

          // Setup temperature sensor library.  
          W1Temp.getSensorsUids()
          .then( function( sensors ) {
            sensorIDs = sensors;
            console.log(sensors);

            // Setup array of sensor controllers.  
            sensorIDs.forEach(sensor => {
              W1Temp.getSensor(sensor).then(function(sensorInstance) {
                sensorControllers.push(sensorInstance);
                sensorInstance.on('change', sensorHandler);
                // console.log("sensorControllers: ", sensorControllers);
              });
            });
            

            // Schedule periodic process every 1 second.
            // setInterval( () => {

            //   if( !mqttClient.connected ) {
            //     console.log( "Reconnecting to MQTT broker" );
            //     mqttClient.reconnect();
            //   }
            // }, 15000);
          })
        }
      });
      browser.start();

      
      
    },

    getSensorUIDs: function () {
      return sensors;
    },

  };

})();

var mqttController = (function () {

})();
  
    
// GLOBAL APP CONTROLLER                    
var controller = (function (sensorCtrl, mqttCtrl) {
  var privateMethod = function () {
  };

  return {
    init: function () {
      console.log('Application starting.');  

      // Initialize the sensor controller.  
      sensorController.init();

      console.log('Application has started.');  
    }
}

})(sensorController, mqttController);


controller.init()