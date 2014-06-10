/*! TETRA.PAK - v0.1.9 - 2013-04-01
* Copyright (c) 2013 SAY Media Inc. */

//     uuid.js
//
//     Copyright (c) 2010-2012 Robert Kieffer
//     MIT License - http://opensource.org/licenses/mit-license.php

(function() {
  var _global = this;

  // Unique ID creation requires a high quality random # generator.  We feature
  // detect to determine the best RNG source, normalizing to a function that
  // returns 128-bits of randomness, since that's what's usually required
  var _rng;

  // Node.js crypto-based RNG - http://nodejs.org/docs/v0.6.2/api/crypto.html
  //
  // Moderately fast, high quality
  if (typeof(require) == 'function') {
    try {
      var _rb = require('crypto').randomBytes;
      _rng = _rb && function() {return _rb(16);};
    } catch(e) {}
  }

  if (!_rng && _global.crypto && crypto.getRandomValues) {
    // WHATWG crypto-based RNG - http://wiki.whatwg.org/wiki/Crypto
    //
    // Moderately fast, high quality
    var _rnds8 = new Uint8Array(16);
    _rng = function whatwgRNG() {
      crypto.getRandomValues(_rnds8);
      return _rnds8;
    };
  }

  if (!_rng) {
    // Math.random()-based (RNG)
    //
    // If all else fails, use Math.random().  It's fast, but is of unspecified
    // quality.
    var  _rnds = new Array(16);
    _rng = function() {
      for (var i = 0, r; i < 16; i++) {
        if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
        _rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
      }

      return _rnds;
    };
  }

  // Buffer class to use
  var BufferClass = typeof(Buffer) == 'function' ? Buffer : Array;

  // Maps for number <-> hex string conversion
  var _byteToHex = [];
  var _hexToByte = {};
  for (var i = 0; i < 256; i++) {
    _byteToHex[i] = (i + 0x100).toString(16).substr(1);
    _hexToByte[_byteToHex[i]] = i;
  }

  // **`parse()` - Parse a UUID into it's component bytes**
  function parse(s, buf, offset) {
    var i = (buf && offset) || 0, ii = 0;

    buf = buf || [];
    s.toLowerCase().replace(/[0-9a-f]{2}/g, function(oct) {
      if (ii < 16) { // Don't overflow!
        buf[i + ii++] = _hexToByte[oct];
      }
    });

    // Zero out remaining bytes if string was short
    while (ii < 16) {
      buf[i + ii++] = 0;
    }

    return buf;
  }

  // **`unparse()` - Convert UUID byte array (ala parse()) into a string**
  function unparse(buf, offset) {
    var i = offset || 0, bth = _byteToHex;
    return  bth[buf[i++]] + bth[buf[i++]] +
            bth[buf[i++]] + bth[buf[i++]] + '-' +
            bth[buf[i++]] + bth[buf[i++]] + '-' +
            bth[buf[i++]] + bth[buf[i++]] + '-' +
            bth[buf[i++]] + bth[buf[i++]] + '-' +
            bth[buf[i++]] + bth[buf[i++]] +
            bth[buf[i++]] + bth[buf[i++]] +
            bth[buf[i++]] + bth[buf[i++]];
  }

  // **`v1()` - Generate time-based UUID**
  //
  // Inspired by https://github.com/LiosK/UUID.js
  // and http://docs.python.org/library/uuid.html

  // random #'s we need to init node and clockseq
  var _seedBytes = _rng();

  // Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
  var _nodeId = [
    _seedBytes[0] | 0x01,
    _seedBytes[1], _seedBytes[2], _seedBytes[3], _seedBytes[4], _seedBytes[5]
  ];

  // Per 4.2.2, randomize (14 bit) clockseq
  var _clockseq = (_seedBytes[6] << 8 | _seedBytes[7]) & 0x3fff;

  // Previous uuid creation time
  var _lastMSecs = 0, _lastNSecs = 0;

  // See https://github.com/broofa/node-uuid for API details
  function v1(options, buf, offset) {
    var i = buf && offset || 0;
    var b = buf || [];

    options = options || {};

    var clockseq = options.clockseq != null ? options.clockseq : _clockseq;

    // UUID timestamps are 100 nano-second units since the Gregorian epoch,
    // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
    // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
    // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.
    var msecs = options.msecs != null ? options.msecs : new Date().getTime();

    // Per 4.2.1.2, use count of uuid's generated during the current clock
    // cycle to simulate higher resolution clock
    var nsecs = options.nsecs != null ? options.nsecs : _lastNSecs + 1;

    // Time since last uuid creation (in msecs)
    var dt = (msecs - _lastMSecs) + (nsecs - _lastNSecs)/10000;

    // Per 4.2.1.2, Bump clockseq on clock regression
    if (dt < 0 && options.clockseq == null) {
      clockseq = clockseq + 1 & 0x3fff;
    }

    // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
    // time interval
    if ((dt < 0 || msecs > _lastMSecs) && options.nsecs == null) {
      nsecs = 0;
    }

    // Per 4.2.1.2 Throw error if too many uuids are requested
    if (nsecs >= 10000) {
      throw new Error('uuid.v1(): Can\'t create more than 10M uuids/sec');
    }

    _lastMSecs = msecs;
    _lastNSecs = nsecs;
    _clockseq = clockseq;

    // Per 4.1.4 - Convert from unix epoch to Gregorian epoch
    msecs += 12219292800000;

    // `time_low`
    var tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
    b[i++] = tl >>> 24 & 0xff;
    b[i++] = tl >>> 16 & 0xff;
    b[i++] = tl >>> 8 & 0xff;
    b[i++] = tl & 0xff;

    // `time_mid`
    var tmh = (msecs / 0x100000000 * 10000) & 0xfffffff;
    b[i++] = tmh >>> 8 & 0xff;
    b[i++] = tmh & 0xff;

    // `time_high_and_version`
    b[i++] = tmh >>> 24 & 0xf | 0x10; // include version
    b[i++] = tmh >>> 16 & 0xff;

    // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)
    b[i++] = clockseq >>> 8 | 0x80;

    // `clock_seq_low`
    b[i++] = clockseq & 0xff;

    // `node`
    var node = options.node || _nodeId;
    for (var n = 0; n < 6; n++) {
      b[i + n] = node[n];
    }

    return buf ? buf : unparse(b);
  }

  // **`v4()` - Generate random UUID**

  // See https://github.com/broofa/node-uuid for API details
  function v4(options, buf, offset) {
    // Deprecated - 'format' argument, as supported in v1.2
    var i = buf && offset || 0;

    if (typeof(options) == 'string') {
      buf = options == 'binary' ? new BufferClass(16) : null;
      options = null;
    }
    options = options || {};

    var rnds = options.random || (options.rng || _rng)();

    // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
    rnds[6] = (rnds[6] & 0x0f) | 0x40;
    rnds[8] = (rnds[8] & 0x3f) | 0x80;

    // Copy bytes to buffer, if provided
    if (buf) {
      for (var ii = 0; ii < 16; ii++) {
        buf[i + ii] = rnds[ii];
      }
    }

    return buf || unparse(rnds);
  }

  // Export public API
  var uuid = v4;
  uuid.v1 = v1;
  uuid.v4 = v4;
  uuid.parse = parse;
  uuid.unparse = unparse;
  uuid.BufferClass = BufferClass;

  if (_global.define && define.amd) {
    // Publish as AMD module
    define(function() {return uuid;});
  } else if (typeof(module) != 'undefined' && module.exports) {
    // Publish as node.js module
    module.exports = uuid;
  } else {
    // Publish as global (in browsers)
    var _previousRoot = _global.uuid;

    // **`noConflict()` - (browser only) to reset global 'uuid' var**
    uuid.noConflict = function() {
      _global.uuid = _previousRoot;
      return uuid;
    };

    _global.uuid = uuid;
  }
}());
var orion = (function (orion) {
    return orion;
}(orion || {}));



var tetra = (function (window, document, orion) {

    /**
     * Tetra private variables
     */
    var _self,
        _base_config = {
            cookie_id   : '_tetraid',
            domain      : (window.location.host || window.location.hostname),
            path        : window.location.pathname,
            ref         : document.referrer,
            sid         : 0,
            conft       : (new Date()),
            initt       : 0,
            loadt       : 0,
            tet         : 0,
            tpt         : 0
        };

    /**
     * Constructor, sets init state
     */
    var tetra = function () {
        _self = this;
        _self._init = false;
        _self._state = 'pre_init';

        _self.init();
    };

    //core
    tetra.prototype = {

        constructor: tetra,

        /**
         * Main initialize method for tetra.
         * Checks for any user defined metadata and builds the query string for beacons.
         * Checks for tetra cookie, if not defined creates it.
         * Generates a new SID (screensession id)
         */
        init: function () {

            _self.conf = {
                'base'      : _base_config,
                'settings'  : window._tetra_config || {}
            };

            if (_self.hasMetaData()) {
                _self.conf.settings.metadataQS = _self.buildMetaQS();
            }

            if (!_self._init) {
                var tetraCookie = _self.getTCookie();

                if (tetraCookie === null) {
                    tetraCookie = _self.setUID(window.uuid.v1());
                    _self.setTCookie(tetraCookie);
                }
                else {
                    _self.setUID(tetraCookie);
                }

                //Set a screen-session id (refresh on pageview)
                _self.setSID(window.uuid.v1());

                _self.eventManager.init();
                _self.conf.base.initt = _self.util.now();
                _self._state = 'init';
                _self._init = true;

                _self.eventManager.tetraEventHandler({
                    'name'      : 'initialized',
                    'block'     : 'page',
                    'curtime'   : _self.conf.base.initt,
                    'region'    : 'body',
                    'contextid' : 'page',
                    'pos'       : {x: 0, y: 0}
                });
            }
        },

        /**
         * Re-initialize tetra when the page becomes
         * active again. Resets initt, tet, tpt values
         * Generates new SID (screensession id)
         */
        reinit: function(){
            _self.conf.base.initt = _self.util.now();
            _self.conf.base.tpt = _self.conf.base.tet = 0;
            _self.setSID(window.uuid.v1());

            _self.idleWatcher.restart();
            _self.eventManager.tetraEventHandler({
                'name'      : 're-initialized',
                'block'     : 'page',
                'curtime'   : _self.conf.base.initt,
                'region'    : 'body',
                'contextid' : 'page',
                'pos'       : {x: 0, y: 0}
            });
        },

        /**
         * Callback method to be used when a page is loaded via Ajax
         * Resets tetra metrics, SID and page metadata
         * @param configObject Object that contains page metadata properties
         */
        ajaxinit: function(configObject){
            _self.conf.base.loadt = _self.util.now();
            _self.conf.base.tpt = _self.conf.base.tet = 0;
            _self.conf.base.path = window.location.pathname;

            //reset page metadata
            if (configObject && configObject.hasOwnProperty("metadata")){
                for(p_property in configObject.metadata){
                    window._tetra_config.metadata[p_property] = configObject.metadata[p_property];
                }
            }

            _self.conf.settings = window._tetra_config;
            _self.conf.settings.metadataQS = _self.buildMetaQS();
            _self.setSID(window.uuid.v1());

            _self.pageWatcher.restart(_self.conf.base.loadt);
            _self.idleWatcher.restart();
            _self.eventManager.tetraEventHandler({
                'name'      : 'ajaxloadedcontent',
                'block'     : 'page',
                'curtime'   : _self.conf.base.loadt,
                'region'    : 'body',
                'contextid' : 'page',
                'pos'       : {x: 0, y: 0}
            });
        },

        /**
         * Builds a query string (key, value pair) based on
         * the _tetra_config.metadata object properties
         * defined by the user.
         * @returns {string} Query String representing metadata object.
         */
        buildMetaQS: function () {
            var qs = _self.util.parseObject2QS(_self.conf.settings.metadata);
            return qs;
        },

        /**
         * Checks to see if user has provided
         * the _tetra_config.metadata object
         * @returns {boolean} True if metadata exists, else False.
         */
        hasMetaData: function () {
            return ( _self.conf.settings && _self.conf.settings.hasOwnProperty("metadata") );
        },

         /**
         * Getter for UID
         * @returns {string} Unique user id
         */
        getUID: function () {
            return _self.conf.base.tuid;
        },

        /**
         * Setter for UID
         * @param uid The unique id to use
         * @returns {string} Unique user id
         */
        setUID: function (uid) {
            _self.conf.base.tuid = uid;
            return _self.conf.base.tuid;
        },

        /**
         * Getter for UID
         * @returns {string} Unique user id
         */
        getSID: function () {
            return _self.conf.base.sid;
        },

        /**
         * Setter for SID
         * @param uid The unique id to use
         * @returns {string} Unique screen-session id
         */
        setSID: function (uid) {
            _self.conf.base.sid = uid;
            return _self.conf.base.sid;
        },

        /**
         * Getter for orion tetra cookie
         * Checks if cookie existse
         * @returns {?string} If yes returns value of cookie or null.
         */
        getTCookie: function () {

            var nameEQ = _self.conf.base.cookie_id + "=",
                dc = document.cookie.split(';');

            for(var i=0; i < dc.length; i++) {
                var c = dc[i];

                while (c.charAt(0)==' ') c = c.substring(1, c.length);
                if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
            }

            return null;
        },

        /**
         * Setter for orion tetra cookie
         * Generates a unique user id using
         * creates a new orion tetra cookie.
         */
        setTCookie: function (value) {
            var name = _self.conf.base.cookie_id,
                date = new Date();

            date.setTime(date.getTime()+(365*24*60*60*1000));
            document.cookie = name + "=" + value + ("; expires=" + date.toGMTString()) + "; path=/";
        },

        /**
         * Method for determining if a default
         * amount of engtime occured between current event
         * and the last even that was fired.
         * @param currentEvent An event object.
         * @param defaultDuration Max duration to apply in ms.
         * @returns {number} Total engaged time
         */
        calculateEngTime: function(currentEvent, defaultDuration){
            var engTime = 0,
                lastEvent = orion.tetrapak.eventManager.getLastEvent(),
                timeLapsed = (currentEvent.curtime || _self.util.now()) - lastEvent.time;

            if( orion.tetrapak.idleWatcher.isInteractionEvent(lastEvent.type) ){
                engTime = (timeLapsed < defaultDuration) ? timeLapsed : defaultDuration;
            }

            return engTime;
        },

        /**
         * Getter for TET
         * @returns {number} Total engaged time
         */
        getTET: function () {
            return _self.conf.base.tet;
        },

        /**
         * Updates total engaged time with the time
         * increment provided
         * @param time_ms Represents time in ms
         */
        updateTET: function (time_ms){
            _self.conf.base.tet += parseInt(time_ms);
        },

        /**
         * Getter for TPT
         * @returns {number} Total page time.
         */
        getTPT: function () {
            return _self.conf.base.tpt;
        },

        /**
         * Calculates total page time by subtracting current time
         * from value of begin time.
         * @param curt Represents current time in timestamp format.
         * @returns {number} Total page time.
         */
        updateTPT: function (curt) {
            var eventTime = (curt || _self.util.now()),
                startTime = (_self.pageWatcher.beginTime || eventTime),
                deltaTime = eventTime - startTime;

            _self.pageWatcher.updatePageTime();

            if( _self.pageWatcher.totaltime ){
                _self.conf.base.tpt = _self.pageWatcher.totaltime + deltaTime;
            }
            else{
                _self.conf.base.tpt = deltaTime;
            }
        }
    };




    /********************************************************************************
    * @module: PageWatcher
    *
    * This module is responsible for keeping track of page time & state
    * by observing page visibility foreground/background (visible/hidden),
    * and page activity (focus/blur).
    *
    ********************************************************************************/
    tetra.prototype.pageWatcher = {

        active      : false,
        enabled     : false,
        state       : 'visible',
        beginTime   : 0,
        currentSegmentTime    : 0,
        totaltime             : 0,
        totaltimeSegments     : [],
        hiddenProperty        : "undefined",
        visibilityChangeEvent : "visibilitychange",

        /**
         * Main initialize method for pageWatcher module.
         * Sets beginTime and page status to active.
         * Sets up page visibility and activity handlers.
         * @param b_timestamp Start time to use.
         */
        init: function(b_timestamp){
            this.active = this.enabled = true;
            this.beginTime = b_timestamp;
            this.addPageActiveListeners();
            this.addPageInactiveListeners();
            this.addPageVisibilityListener();
        },

        /**
         * Restart pageWatcher module.
         * Resets active, enabled, beginTime, totalTime, state to default values.
         * @param b_timestamp Start time to use.
         */
        restart: function(b_timestamp){
            this.active = this.enabled = true;
            this.beginTime = b_timestamp;
            this.totaltime = 0;
            this.state = 'visible';
        },

        /**
         * Attaches handler to window.blur
         */
        addPageActiveListeners: function(){
            _self.eventManager.addListener(window, 'blur', this.pageBlurHandler);
        },

        /**
         * Attaches handler to window.focus
         */
        addPageInactiveListeners: function(){
            _self.eventManager.addListener(window, 'focus', this.pageFocusHandler);
        },

        /**
         * Determines the totaltime for this page visit
         * by aggregating all time segments where the user was 'active'
         */
        updatePageTime: function(){
            _self.pageWatcher.totaltime = 0;

            for (var i = 0; i < _self.pageWatcher.totaltimeSegments.length; i++) {
                _self.pageWatcher.totaltime += _self.pageWatcher.totaltimeSegments[i];
            }
        },

        pageBlurHandler: function(e) {
            var eventTime = _self.util.now();

            if (e.target == window && _self.pageWatcher.active) {
                _self.pageWatcher.active = false;
                _self.eventManager.tetraEventHandler({
                    'name': 'vizchange',
                    'curtime': eventTime,
                    'action' : 'hidden',
                    'engtime': 0,
                    'block'  : 'page',
                    'region' : 'body',
                    'contextid': 'page',
                    'pos': {x:0, y:0}
                });

                _self.pageWatcher.currentSegmentTime = eventTime - _self.pageWatcher.beginTime;
                _self.pageWatcher.totaltimeSegments.push(_self.pageWatcher.currentSegmentTime );
            }
            else {
                // user is blurring off a page element == interaction.
                _self.eventManager.addNewEvent({type: e.type, time: eventTime});
            }
        },

        pageFocusHandler: function(e) {
            var eventTime = _self.util.now();

            if (e.target == window) {
                _self.pageWatcher.active = true;
                _self.pageWatcher.beginTime = eventTime;
                _self.eventManager.tetraEventHandler({
                    'name': 'vizchange',
                    'curtime': eventTime,
                    'action' : 'visible',
                    'engtime': 0,
                    'block'  : 'page',
                    'region' : 'body',
                    'contextid': 'page',
                    'pos': {x:0, y:0}
                });
            }
            else {
                // user is focusing on a page element == interaction.
                _self.eventManager.addNewEvent({type: e.type, time: eventTime});
            }
        },

        //HTML5 only
        addPageVisibilityListener: function() {

            // set name of hidden property and visibility change event
            // based on browser model
            if (typeof document.hidden !== "undefined") {
                _self.pageWatcher.hiddenProperty = "hidden";
                _self.pageWatcher.visibilityChangeEvent = "visibilitychange";
            } else if (typeof document.mozHidden !== "undefined") {
                _self.pageWatcher.hiddenProperty = "mozHidden";
                _self.pageWatcher.visibilityChangeEvent = "mozvisibilitychange";
            } else if (typeof document.msHidden !== "undefined") {
                _self.pageWatcher.hiddenProperty = "msHidden";
                _self.pageWatcher.visibilityChangeEvent = "msvisibilitychange";
            } else if (typeof document.webkitHidden !== "undefined") {
                _self.pageWatcher.hiddenProperty = "webkitHidden";
                _self.pageWatcher.visibilityChangeEvent = "webkitvisibilitychange";
            }

            _self.eventManager.addListener(document, _self.pageWatcher.visibilityChangeEvent, this.pageVisibilityHandler);
        },

        //HTML5 only
        pageVisibilityHandler: function() {
            var eventTime = _self.util.now();

            if (document[_self.pageWatcher.hiddenProperty]) {
                _self.pageWatcher.state = "hidden";

                if( _self.pageWatcher.active){
                    _self.pageWatcher.currentSegmentTime = eventTime - _self.pageWatcher.beginTime;
                    _self.pageWatcher.totaltimeSegments.push( _self.pageWatcher.currentSegmentTime );
                    _self.pageWatcher.active = false;
                }
            }
            else{
                _self.pageWatcher.active = true;
                _self.pageWatcher.beginTime = eventTime;
                _self.pageWatcher.state = "visible";
            }
        },

        isPageActive: function() {
            return _self.pageWatcher.active;
        },

        isPageVisible: function() {
            return (_self.pageWatcher.state !== "hidden");
        },

        getPageState: function() {
            return _self.pageWatcher.state;
        }
    },




    /********************************************************************************
    * @module: IdleWatcher
    *
    * This module is responsible for keeping track of user
    * state - idle/active on the page.
    *
    ********************************************************************************/
    tetra.prototype.idleWatcher = {

        enabled     : false,
        state       : 'init',
        duration    : 30000,
        startTime   : 0,
        stopTime    : 0,
        timerID     : -1,

        init: function() {
            this.start();
        },

        start: function() {
            this.startTime = _self.util.now();
            this.enabled = true;
            this.state = 'init';
            this.timerID = setInterval(this.timerHandler, this.duration);
        },

        stop: function() {
            this.stopTime = _self.util.now();
            this.timerID = clearInterval(this.timerID);
            this.enabled = false;
        },

        restart: function() {
            if (this.enabled) {
                this.stop();
            }
            this.start();
        },

        /**
        * Determines the current state of user & page.
        */
        timerHandler: function() {
            var lastEvent = _self.eventManager.getLastEvent(),
                currentTime = _self.util.now();

            if (_self.idleWatcher.isMaxIdle(lastEvent.time)){

                //Check to see if we need to re-initialize a new session
                //we only reinit if page is visible and active (in focus)
                //else user is away from the page i.e. 'abandoned'
                if(_self.pageWatcher.isPageVisible() && _self.pageWatcher.isPageActive()){
                    _self.reinit();
                }
                else{
                    _self.eventManager.tetraEventHandler({
                        'name': 'outoffocusabandon',
                        'curtime': _self.util.now(),
                        'engtime': 0,
                        'block': 'page',
                        'region': 'body',
                        'contextid': 'page',
                        'pos': {x:0, y:0}
                    });
                    _self.idleWatcher.state = 'abandoned';
                }
            }
        },


        /**
        * Check if user has reached idle cap (30mins)
        * @param e_time_ms Represents time of last event,
        * @returns {Boolean} True if user has been idle for maximum time, else False.
        */
        isMaxIdle: function(e_time_ms){
            var c_time_ms = _self.util.now(),
                maxIdle_mins = 30,
                timeLapse_mins = 0;

            timeLapse_mins = (c_time_ms - e_time_ms) / (1000*60);

            //Clean up - we don't need all those decimal places
            timeLapse_mins = Math.round(timeLapse_mins*100)/100;
            return (timeLapse_mins >= maxIdle_mins);
        },

        /**
        * Check if an event qualifies as an interaction event.
        * @param eventType String that represent type of event. i.e. 'social', 'mousemove'
        * @returns {Boolean} True if event qualifies as interaction, else False.
        */
        isInteractionEvent: function(eventType){
            return (eventType.indexOf('social') > -1)
                        || (eventType.indexOf('pageloadedcontent') > -1)
                            || (eventType.indexOf('ajaxloadedcontent') > -1)
                                || (_self.eventManager.UIEvents.indexOf(eventType) > -1);
        }
    };




    /********************************************************************************
    * @module: EventManager
    *
    * This module is responsible for initializing all listeners and
    * defining all handlers for DOM, USER and SAY page controller events.
    *
    ********************************************************************************/
    tetra.prototype.eventManager = {

        DOMInactiveEvents   : ['abort', 'unload'],
        UIEvents            : ['keydown', 'scroll', 'mousemove', 'mousedown', 'touchstart', 'touchmove'],

        tet_eq:[],

        init: function() {

            this.addListener(window, 'load', function(e) {
                _self.conf.base.loadt = _self.util.now();

                //init the modules
                _self.pageWatcher.init(_self.conf.base.loadt);
                _self.idleWatcher.init();
                _self.eventManager.tetraEventHandler({
                    'name': 'pageloadedcontent',
                    'curtime': _self.conf.base.loadt,
                    'block': 'page',
                    'region': 'body',
                    'contextid': 'page',
                    'pos': {x:0, y:0}
                });
            });

            this.addListener(window, 'beforeunload', function(e) {

                var engTime = _self.calculateEngTime(e, _self.idleWatcher.duration) || 0,
                    curtime = _self.util.now();

                if( engTime ){
                    _self.updateTET(engTime);
                }

                _self.eventManager.tetraEventHandler({
                    'name': 'abandonedcontent',
                    'curtime': curtime,
                    'engtime': engTime,
                    'block': 'page',
                    'region': 'body',
                    'contextid': 'page',
                    'pos': {x:0, y:0}
                });
                _self.idleWatcher.state = 'abandoned';

                // block the execution for a short amount of time to
                // let the beacons go out (duplicate of SAY ad behavior).
                var diff, delayBy = 300, startt = (new Date()).getTime();
                do{
                    diff = (new Date()).getTime() - startt;
                }
                while (diff >= 0 && diff < delayBy);
            });

            this.addDOMListeners();
            this.addInteractionListeners();
            this.addSocialListeners();

            //required for capturing & sending SAY Ad rid(s)
            _self.beaconManager.hookAdBeacons();
        },

        addListener: function(el, ev, fn) {

            if (el.addEventListener) {
                addEvent = function (el, ev, fn) {
                    el.addEventListener(ev, fn, true);
                };
            } else if (el.attachEvent) {
                addEvent = function (el, ev, fn) {
                    el.attachEvent('on' + ev, fn);
                };
            } else {
                addEvent = function (el, ev, fn) {
                    el['on' + ev] =  fn;
                };
            }

            addEvent(el, ev, fn);
        },

        removeListener: function(el, ev, fn){

            if (el.removeEventListener) {
                removeEvent = function (el, ev, fn) {
                    el.removeEventListener(ev, fn, true);
                };
            } else if (el.detachEvent) {
                removeEvent = function (el, ev, fn) {
                    el.detachEvent('on' + ev, fn);
                };
            }

            removeEvent(el, ev, fn);
        },

        removeDOMListeners: function(el, ev, fn){
            var deLEN = _self.eventManager.DOMInactiveEvents.length;

            for(var i=0; i<deLEN; i++){
                _self.eventManager.removeListener(window, _self.eventManager.DOMInactiveEvents[i], function (e) {});
            }
        },

        addDOMListeners: function() {
            var deLEN = this.DOMInactiveEvents.length;

            for(var i=0; i<deLEN; i++){
                this.addListener(window, this.DOMInactiveEvents[i], function (e) {
                    _self.eventManager.tetraEventHandler({
                        'name': 'abandonedcontent',
                        'curtime': _self.util.now(),
                        'engtime': 0,
                        'block': 'page',
                        'region': 'body',
                        'contextid': 'page',
                        'pos': {x:0, y:0}
                    });
                    _self.idleWatcher.state = 'abandoned';
                });
            }
        },

        addInteractionListeners: function() {
            var IElen = this.UIEvents.length;

            for(var i=0; i<IElen; i++){

                //This is required, since for IE(8/7)
                //mousemove & mousedown events are NOT available on window object
                var context = (this.UIEvents[i] == 'mousemove' ||  this.UIEvents[i] == 'mousedown') ? window.document : window;

                this.addListener(context, this.UIEvents[i], _self.util.debounce(function (e) {

                    var eventName = e.type,
                        eventTime = _self.util.now();
                        target = (e.target || e.srcElement) || window.document,
                        tParents = _self.util.parents(target),
                        blockID = _self.util.getBlock(target, tParents),
                        regionID = (eventName == "scroll") ? "document" : _self.util.getRegion(target, tParents),
                        contextID = (eventName == "scroll") ? "document" : _self.util.getContext(target),
                        tPos = (eventName == "scroll") ? _self.util.getScrollPos() : _self.util.getXY(e);

                    //If keydown results in document scroll,
                    //send the scroll beacon instead.
                    if (eventName == 'keydown') {
                        eventName = _self.eventManager.isScrollEvent(e) ? 'scroll' : eventName;
                    }

                    var tetraEvent = {
                        'name'      :eventName,
                        'engtime'   :e.engtime,
                        'curtime'   :eventTime,
                        'block'     :blockID,
                        'region'    :regionID,
                        'contextid' :contextID,
                        'pos'       :tPos
                    };

                    if (target.href) {
                        tetraEvent.tgt = target.href;
                    }

                    _self.pageWatcher.active = true;
                    _self.eventManager.tetraEventHandler(tetraEvent);
                    _self.idleWatcher.restart();

                }, 500));
            }
        },

        removeInteractionListeners: function(el, ev, fn){
            var IElen = _self.eventManager.UIEvents.length;

            for(var i=0; i<IElen; i++){
                _self.eventManager.removeListener(window, _self.eventManager.UIEvents[i], _self.util.debounce(function (e) {}, 500));
            }
        },

        addSocialListeners: function() {
            _self.eventManager.disqusEventListeners();
            _self.eventManager.fbookEventListeners();
            _self.eventManager.twttrEventListeners();
        },

        fbookEventListeners:function() {

            //until we have a way to determine 'et' inside facebook iframe
            //we can guesstimate an average engaged time in ms.
            var defaultETLike = 21000,
                defaultETMessage = 30000,
                fbEvent, FBTimerId;

            var FBTimerCheck = function(){
                if (window.FB) {
                    window.FB.Event.subscribe('edge.create', function(href) {
                        fbEvent = orion.tetrapak.eventManager.buildFBEvent('like', defaultETLike, href);
                        orion.tetrapak.eventManager.sendFBEvent(fbEvent);
                    });

                    window.FB.Event.subscribe('edge.remove', function(href) {
                        fbEvent = orion.tetrapak.eventManager.buildFBEvent('unlike', defaultETLike, href);
                        orion.tetrapak.eventManager.sendFBEvent(fbEvent);
                    });

                    window.FB.Event.subscribe('message.send', function(href) {
                        fbEvent = orion.tetrapak.eventManager.buildFBEvent('send', defaultETMessage, href);

                        //determine engaged time, apply default ET (max) if necessary.
                        fbEvent.engtime = orion.tetrapak.calculateEngTime(fbEvent, defaultETMessage) || 0;
                        orion.tetrapak.eventManager.sendFBEvent(fbEvent);
                    });

                    window.FB.Event.subscribe('comment.create', function(href) {
                        fbEvent = orion.tetrapak.eventManager.buildFBEvent('send', defaultETMessage, href);

                        //determine engaged time, apply default ET (max) if necessary.
                        fbEvent.engtime = orion.tetrapak.calculateEngTime(fbEvent, defaultETMessage) || 0;
                        orion.tetrapak.eventManager.sendFBEvent(fbEvent);
                    });

                    clearInterval(FBTimerId);
                }
            };

            FBTimerId = setInterval(FBTimerCheck, 500);
        },

        buildFBEvent: function(p_action, p_engtime, p_tgt){
            var FBEvent = {
                'name': 'social',
                'block': 'page',
                'region': 'body',
                'contextid': 'facebook',
                'pos': {x:0, y:0}
            };

            FBEvent.action = p_action;
            FBEvent.curtime = orion.tetrapak.util.now();
            FBEvent.engtime = p_engtime;
            FBEvent.tgt = p_tgt;

            return FBEvent;
        },

        sendFBEvent: function(fb_event){
            orion.tetrapak.pageWatcher.active = true;
            orion.tetrapak.updateTET(fb_event.engtime);
            orion.tetrapak.eventManager.tetraEventHandler(fb_event);
        },

        twttrEventListeners:function() {
            //until we have a way to determine 'et' inside twitter iframe
            //we can guesstimate an average engaged time in ms.
            var defaultET = {'click':21000, 'tweet':50000, 'retweet':21000, 'favorite':21000, 'follow':21000},
                twtr_events = ['click', 'tweet', 'retweet', 'favorite', 'follow'],
                eLen = twtr_events.length,
                twttrTimerId;

            var twitterFunc = function(twttr){

                for (var i = 0; i < eLen; i++) {
                    var e = twtr_events[i];

                    twttr.events.bind(e, function(e) {
                        var target = (e.target || e.srcElement),
                            eTime = orion.tetrapak.util.now(),
                            engTime = orion.tetrapak.calculateEngTime(e, defaultET[e.type]) || 0,
                            tParents = _self.util.parents(target),
                            blockID = _self.util.getBlock(target, tParents),
                            regionID = _self.util.getRegion(target, tParents),
                            contextID = _self.util.getContext(target);

                        orion.tetrapak.pageWatcher.active = true;
                        orion.tetrapak.updateTET(engTime);
                        orion.tetrapak.eventManager.tetraEventHandler({
                            'name'      : 'social',
                            'action'    : e.type,
                            'curtime'   : eTime,
                            'engtime'   : engTime,
                            'block'     : blockID,
                            'region'    : regionID,
                            'contextid' : 'twitter',
                            'pos'       : {x:0, y:0}
                        });
                    });
                }
            };

            //This is necessary since their may be scripts and pages
            //that lazy load social plugins, therefore global objects
            //won't exist till some future event occurs, we want to bind
            //as soon as its available.
            var twitterTimerCheck = function(){
                if (typeof window.twttr == 'object' && orion.tetrapak.util.propertyExists(window.twttr, 'ready')){
                     window.twttr.ready(twitterFunc);
                     clearInterval(twttrTimerId);
                }
            };

            twttrTimerId = setInterval(twitterTimerCheck, 500);
        },

        disqusEventListeners:function(){

            //until we have a way to determine 'et' inside disqus iframe
            //we can guesstimate an average engaged time in ms.
            var defaultET = 80500;
            var disqusEvent = {
                'name'      : 'social',
                'action'    : 'comment',
                'engtime'   : 0,
                'block'     : 'page',
                'region'    : 'body',
                'contextid' : 'disqus',
                'pos'       : {x:0, y:0}
            };

            var disqusFunc = function(){
                disqusEvent.curtime = orion.tetrapak.util.now();
                disqusEvent.engtime = orion.tetrapak.calculateEngTime(disqusEvent, defaultET) || 0;

                orion.tetrapak.pageWatcher.active = true;
                orion.tetrapak.updateTET(disqusEvent.engtime);
                orion.tetrapak.eventManager.tetraEventHandler(disqusEvent);
            };

            if (window.DISQUS) {
                if (window.DISQUS.bind) {
                    window.DISQUS.bind('comment.onCreate', disqusFunc);
                }
                else if (window.DISQUS.App) {
                    var app = window.DISQUS.App.get(0);

                    if (app) {
                        app.bind('posts.create', disqusFunc);
                    }
                }
            }
            else {
                //If we can't find the window.DISQUS object then set preload config.
                //this method will be called on DISQUS object loads.
                window.disqus_config = function() {
                    this.callbacks.onNewComment = [disqusFunc];
                }
            }
        },

        /**
         * Handles ALL tetra events that need to be sent.
         * stores copy of last event in tetra event queue,
         * builds and sends the beacon.
         * @param tetraEvent Represents event object,
         */
        tetraEventHandler: function(tetraEvent){

            var tetraBeacon;

            //Only send interaction beacons if user has not abandoned.
            //If abandoned, only send abort/abandon beacons
            if( _self.idleWatcher.state !== "abandoned"
                || tetraEvent.name.indexOf('abandonedcontent') > -1){

                this.addNewEvent({type: tetraEvent.name, time: tetraEvent.curtime});
                _self.updateTPT(tetraEvent.curtime);

                tetraBeacon = _self.beaconManager.buildBeacon(tetraEvent);
                _self.beaconManager.sendBeacon(tetraBeacon);
            }
        },

        /**
         * Stores event to tetra event queue.
         * @param e Represents event object,
         * {name: 'eventName', time: timeStamp}
         */
        addNewEvent: function(e){
            this.tet_eq.push(e);
        },

        /**
         * Retrieves last event that was fired
         * @returns {Object} represents last event,
         * {name: eventName, time: timeStamp}
         */
        getLastEvent: function(){
            return this.tet_eq[this.tet_eq.length-1];
        },

         /**
         * Checks to see if key event is a scroll action
         * @param e The event to check
         * @returns {boolean} True if keycode results in scroll, else false.
         */
        isScrollEvent: function(e){
            var scrollFlag = false,
                key = e.keyCode ? e.keyCode : e.which;

            // checking for arrow keys 37, 38, 39, 40
            // and space bar - 32
            if( key == 32 || (key > 36 && key < 41) ) {
                scrollFlag = true;
            }

            return scrollFlag;
        }
    };




    /********************************************************************************
    * @module: BeaconManager
    *
    * This module is responsible for defining, building, sending
    * media beacons.
    *
    ********************************************************************************/
    tetra.prototype.beaconManager = {
        beaconURL:'http://beacon.orion.saymedia.com',

         /**
         * Checks to see if key event is a scroll action
         * @param tetraEvent The event object to send
         * @returns {string} The custom beacon URL for the event.
         */
        buildBeacon: function(tetraEvent) {
            var now = _self.util.now();
            var b = this.beaconURL + '/' + tetraEvent.name + '?'
                + "tuid="       + _self.getUID()
                + "&sid="       + _self.getSID()
                + "&curtime="   + (tetraEvent.curtime || now)
                + "&engtime="   + (tetraEvent.engtime || 0)
                + "&tet="       + _self.getTET()
                + "&tpt="       + _self.getTPT();

                //append any additional page metadata
                //if defined by user at in _tetra_config
                if (_self.hasMetaData()) {
                    b += _self.conf.settings.metadataQS;
                }

                if( _self.conf.base.ref ){
                    b += "&ref=" +  encodeURIComponent(_self.conf.base.ref);
                }

                b += "&domain=" + encodeURIComponent(_self.conf.base.domain)
                    + "&pagepath=" + encodeURIComponent(_self.conf.base.path)
                    + "&regionid="  + tetraEvent.region
                    + "&blockid="   + tetraEvent.block
                    + "&contextid=" + tetraEvent.contextid
                    + "&x="         + tetraEvent.pos.x
                    + "&y="         + tetraEvent.pos.y;

                //append tgt = target if the event had an href.
                if (tetraEvent.tgt) {
                    b += "&tgt=" + encodeURIComponent(tetraEvent.tgt);
                }

                //apend action = social-action-name if the event contains the param
                if (tetraEvent.action) {
                    b += "&action=" + encodeURIComponent(tetraEvent.action);
                }

                //append any additional misc params provided
                //to the orion beacon
                if (tetraEvent.params) {
                    b += tetraEvent.params;
                }

                return b;
        },

         /**
         * Overrides the VE_beaconLog method set by Say Media Ad - PageController
         * in order to piggyback on the ad beacons. This is a temporary approach
         * for tetra to gather the rids on the page.
         */
        hookAdBeacons: function() {

            var oldVE_beaconLogFunc;

            //store copy of existing VE_beaconLog func
            if (window.VE_beaconLog) {
                oldVE_beaconLogFunc = window.VE_beaconLog;
            }

            //Override global VE_beaconLog func
            window.VE_beaconLog = function(e) {

                //only inspect SAY ad calls
                if (e.indexOf('beacon.saymedia.com') > -1) {

                    var urlObject = _self.util.parseURL(e),
                        beaconName = urlObject.path,
                        beaconQS = "&"+urlObject.query;

                    //we only want to duplicate 'init' beacon
                    if (beaconName.indexOf("init") > -1)
                    {
                        var addToTetraParams = '',
                            beaconParams = _self.util.parseQS2Object(beaconQS),
                            tetraParamOverrides = {
                                'name'      :beaconName,
                                'curtime'   :beaconParams.curtime || _self.util.now(),
                                'x'         :beaconParams.x,
                                'y'         :beaconParams.y
                            };

                        for(param in beaconParams){
                            if ( !tetraParamOverrides[param] ){
                                addToTetraParams += '&'+param+'='+beaconParams[param];
                            }
                        }

                        var tetraEvent = {
                            'name'      : tetraParamOverrides.name,
                            'curtime'   : tetraParamOverrides.curtime,
                            'engtime'   : 0,
                            'pos'       : {'x': tetraParamOverrides.x, 'y': tetraParamOverrides.y},
                            'block'     : 'page',
                            'region'    : 'body',
                            'contextid' : 'ad',
                            'params'    : addToTetraParams
                        };

                        _self.eventManager.tetraEventHandler(tetraEvent);
                    }
                }

                //then run the old function
                if (oldVE_beaconLogFunc) {
                    try{ oldVE_beaconLogFunc(); } catch(e){}
                }
            };
        },

        sendBeacon: function(url) {
            var b = document.createElement("img");
                b.src = url;
        }
    };




    /********************************************************************************
    * @module: UTIL
    *
    * This module contains common methods that can be used
    * across all modules and provide general helper functionality.
    *
    ********************************************************************************/
    tetra.prototype.util = {

        debounce: function(func, threshold) {

            var timeout, starttime, endtime, engtime, eventtime,
                defaultThreshold = 100,
                minEventtimeMS = 10,
                eventQ = [];

            return function debounced () {

                var obj = this,
                    evtCopy = {},
                    mainEvent = arguments[0];

                //This is required for IE8 fix
                for (var i in mainEvent) { evtCopy[i] = mainEvent[i]; }

                eventtime = _self.util.now();
                eventQ.push(eventtime);

                if (starttime == null) { starttime = eventtime; }

                function delayed (event) {
                    endtime = getRealEndTime();
                    engtime = endtime - starttime;

                    //update engaged time for event
                    event.engtime = engtime;
                    _self.updateTET(engtime);

                    //call event handler
                    func.apply(obj, [event]);

                    //reset values
                    timeout = starttime = endtime = engtime = null;
                    eventQ = [];
                };

                function getRealEndTime() {
                    return eventQ.length > 1 ? eventQ.pop() : (starttime + minEventtimeMS);
                };

                if (timeout) { clearTimeout(timeout); }
                timeout = setTimeout( function(){ delayed(evtCopy); }, threshold || defaultThreshold);
            };
        },

        getBlock: function(el, ancestors) {
            var aLen = ancestors.length,
                result = 'body';

            if (this.propertyExists(_self.conf.settings.pagemodel, 'blockids')) {
                for (var i = 0; i < aLen; i++) {
                    if (_self.conf.settings.pagemodel.blockids.indexOf(ancestors[i]) >= 0) {
                        result = ancestors[i];
                    }
                }
            }

            return result;
        },

        getRegion: function(el, ancestors) {
            var ancestorList = ancestors.join(", "),
                wildcard = '(.+)',
                result, kpattern, regex;

            if (this.propertyExists(_self.conf.settings.pagemodel, 'regionids')) {
                for (var key in _self.conf.settings.pagemodel.regionids)
                {
                    if (key.indexOf('%') >= 0) {
                        kpattern = key.replace(/%/g, wildcard);
                    }
                    regex = new RegExp(kpattern,'g');

                    if (regex.test(ancestorList)) {
                        result = _self.conf.settings.pagemodel.regionids[key];
                    }
                }
            }

            //If user hasn't specified it in mapping then
            //try to infer what the region is from ancestors.
            if (result == null) { result = ancestors.pop(); }

            return result;
        },

        getContext: function(el) {
            var cID = this.parents(el).pop();
            return cID;
        },

        getScrollPos: function() {
            var posx, posy = 0;

            if (typeof(window.pageYOffset) == 'number') {
                //Netscape compliant
                posy = window.pageYOffset;
                posx = window.pageXOffset;
            }
            else if (document.body) {
                //DOM compliant
                posy = document.body.scrollTop;
                posx = document.body.scrollLeft;
            }
            else if (document.documentElement) {
                //IE6 standards compliant mode
                posy = document.documentElement.scrollTop;
                posx = document.documentElement.scrollLeft;
            }

            return {'x':posx, 'y':posy};
        },

        getXY: function(event) {
            var posx, posy = 0;

            posx = event.clientX !== undefined ? event.clientX : (event.pageX + document.offsetWidth);
            posy = event.clientY !== undefined ? event.clientY : (event.pageY + document.offsetHeight);

            return {'x':posx, 'y':posy};
        },

        propertyExists: function(obj, prop) {
            return obj && obj.hasOwnProperty(prop);
        },

        parents: function (node) {
            var nodes = [];

            for (; node; node = node.parentNode) {
                if (node.id && node.id !== "") {
                    nodes.unshift(node.id);
                }
            }
            return nodes;
        },

        parseObject2QS: function(p_object) {
            var queryString = '';

            for(p_property in p_object){
                queryString += "&" + p_property + "=" + encodeURIComponent(p_object[p_property]);
            }

            return queryString;
        },

        parseQS2Object: function(query) {
            var queryObject = {},
                parts = (query.indexOf("?") >= 0) ? query.split("?").pop().split("&") : query.split("&"),
                i = parts.length;

            while (--i) {
                var item = parts[i].split("=");
                queryObject[item[0]] = item[1];
            }

            return queryObject;
        },

        parseURL: function(url) {
            //Regex for url parsing from Douglas Crockford's
            //popular book: JavaScript: The Good Parts
            var parse_regex = /^(?:([A-Za-z]+):)?(\/{0,3})([0-9.\-A-Za-z]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?([^#]*))?(?:#(.*))?$/,
                result = parse_regex.exec(url),
                names = ['url', 'scheme', 'slash', 'host', 'port', 'path', 'query', 'hash'],
                nLen = names.length,
                blanks = '       ',
                urlObject = {};

            for (var i = 0; i < nLen; i += 1) {
                urlObject[names[i]] = result[i];
            }

            return urlObject;
        },

        now: function() {
            return new Date().getTime();
        }
    };

    //IMPORTANT: returning the initialized tracker object.
    return tetra;

})(window, document, orion);


/*
* START TETRA!!!!
*/
if(!orion.tetrapak){
    orion.tetrapak = new tetra();
}
