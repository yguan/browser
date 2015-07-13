/*jslint nomen: true*/
/*global module,require */

module.exports = {
    select: function (selector, win) {
        return win.document.querySelector(selector);
    },
    selectAll: function (selector, win) {
        return win.document.querySelectorAll(selector);
    }
};