/*jslint nomen: true*/
/*global module,require */

var simulateEvent = require('simulate-dom-event');

// todo: need to add more methods
module.exports = {
    click: function (element) {
        simulateEvent(element,'click',{
            which:2
        });
    },
    typeValue: function (element, value) {
        element.value = value; // this line only works for input and textarea
        simulateEvent(element,'keyup');
    }
};