/*jslint nomen: true*/
/*global module,require */

var Q = require("q");
var Automation = require('./automation');
var browserInstance;
var chainableMethods = [
    'openWindow',
    'waitFor',
    'waitForElementExist',
    'getElements',
    'click',
    'typeValue'
];

function Browser() {
    this.funcs = [];
}

Browser.prototype = {
    init: function (config) {
        config = config || {};

        if (config.automation) {
            this.automation = config.automation;
            this.config = this.automation.config;
            return this;
        }

        this.automation = new Automation();
        this.automation.init(config);
        this.config = config;
        return this;
    },
    addToQ: function (fn) {
        this.funcs.push(fn);
        return this;
    },
    getIframe: function (selector, timeoutMs) {
        var me = this,
            iframe = new Browser();

        me.addToQ(function () {
            me.automation
                .getIframe(selector, timeoutMs)
                .then(function (iframeAutomation) {
                    iframe.init(iframeAutomation);
                });
        });
        return iframe;
    },
    then: function (callback) {
        this.addToQ(callback);
        return this;
    },
    done: function (callback) {
        this.funcs.reduce(Q.when, Q(1)).then(callback).done();
        this.funcs = [];
    }
};

chainableMethods.forEach(function (name) {
    Browser.prototype[name] = function () {
        var me = this,
            args = arguments;
        me.addToQ(function () {
            return me.automation[name].apply(me.automation, args);
        });
        return me;
    }
});
function getInstance() {
    if (!browserInstance) {
        browserInstance = new Browser();
    }
    return browserInstance;
}

module.exports = getInstance();