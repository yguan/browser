/*jslint nomen: true*/
/*global module,require */

var Q = require("q");
var wait = require('wait-js');
var simulate = require('./simulate');
var domQuery = require('./dom-query');
var defaultWindowFeatures = 'menubar=yes,location=yes,resizable=yes,scrollbars=yes,status=yes';
var browserInstance;

function waitFor(options) {
    return Q.Promise(function (resolve, reject, notify) {
        wait.for({
            testFn: function () {
                try {
                    return options.testFn();
                } catch (ex) {
                    return false;
                }
            },
            onReady: function () {
                resolve(options.onReady());
            },
            onTimeout: function () {
                throw options.timeoutMessage;
            },
            timeoutMs: options.timeoutMs
        });
    });
}

function selectElements(selector, win) {
    return domQuery.selectAll(selector, win);
}

function elementExist(selector, win) {
    var element = domQuery.select(selector, win);
    return element !== null;
}

function Automation() {
    this.funcs = [];
}

Automation.prototype = {
    init: function (config) {
        var me = this;

        this.config = config || {};

        me.defaultTimeoutMs = this.config.defaultTimeoutMs || {
            elementExist: 5000,
            implicitWait: 100
        };
    },
    addToQ: function (fn) {
        me.funcs.push(fn);
    },
    openWindow: function (url, windowFeatures) {
        var me = this;
        var win = window.open(url, 'win', windowFeatures || defaultWindowFeatures);
        me.currentWindow = win;
    },
    waitFor: function (options) {
        var me = this,
            timeoutMessage = 'waitFor condition timeout';

        return waitFor({
            testFn: options.testFn,
            onReady: options.onReady,
            timeoutMessage: timeoutMessage,
            timeoutMs: options.timeoutMs || me.defaultTimeoutMs.implicitWait
        });
    },
    getElements: function (selector, timeoutMs) {
        var me = this,
            timeoutMessage = 'getElements timeout for ' + selector;

        return waitFor({
            testFn: function () {
                return elementExist(selector, me.currentWindow);
            },
            onReady: function () {
                return selectElements(selector, me.currentWindow);
            },
            timeoutMessage: timeoutMessage,
            timeoutMs: timeoutMs || me.defaultTimeoutMs.elementExist
        });
    },
    click: function (selector, timeoutMs) {
        var me = this;

        return me.getElements({
                selector: selector,
                timeoutMs: timeoutMs || me.defaultTimeoutMs.elementExist
            }).then(function (elements) {
                simulate.click(elements[0]);
            });
    },
    typeValue: function (selector, value, timeoutMs) {
        var me = this;
        return me.getElements({
                selector: selector,
                timeoutMs: timeoutMs || me.defaultTimeoutMs.elementExist
            }).then(function (elements) {
                var element = elements[0];
                element.value = value;
                simulate.typeValue(element, 'keyup');
            });
    },
    getIframe: function (selector, timeoutMs) {
        var me = this,
            iframe = new Automation();

        iframe.init(me.config);
        return me.getElements({
                selector: selector,
                timeoutMs: timeoutMs || me.defaultTimeoutMs.elementExist
            }).then(function (elements) {
                iframe.currentWindow = elements[0].contentWindow;
                return iframe;
            });
    }
};

module.exports = Automation;