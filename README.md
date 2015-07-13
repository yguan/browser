# Browser Automation Utility

This repository contains the source code of a browser automation utlility, which supports in-browser automation with asynchronous chaining feature.

## Overview

The basic concept of this browser automation utility is to use JavaScript directly manipulate the browser, and it uses the JavaScript library available to the browser to manipulate the browser's DOM.

## Development

#### Overview of Folder Structure

* `src` contains the pre-build files of the UI Recorder.
* `test` contains the files for testing the UI recorder.
* `gulp` contains the gulp task files.

#### Set up The Local Environment

Here are the steps:

* Install `gulp` globally if you haven't done so.
* Run `npm install`.
* Run `gulp` to build the `browser.js`.

## Usage

`browser.js` is built with [Browserify's standalone option](http://www.forbeslindesay.co.uk/post/46324645400/standalone-browserify-builds). You can use it with CommonJS, require.js, or include the file directly.

Here is a sample that use `window.browser`:
```javascript
var browser = window.browser;

browser
    .init()
    .openWindow('https://github.com/yguan/browser') // The operation is added to the chain, but not executed.
    .done(); // Execute all operations in the chain

browser
    .getElements('.entry-title')
    .then(function (elements) {
        console.log(arguments);
    })
    .done();
```

## License

[MIT](http://opensource.org/licenses/MIT)