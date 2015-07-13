!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.browser=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
/*jslint nomen: true*/
/*global module,require */

module.exports = _dereq_('./src/browser');
},{"./src/browser":7}],2:[function(_dereq_,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.once = noop;
process.off = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],3:[function(_dereq_,module,exports){
(function (process){
// vim:ts=4:sts=4:sw=4:
/*!
 *
 * Copyright 2009-2012 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 *
 * With parts by Tyler Close
 * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
 * at http://www.opensource.org/licenses/mit-license.html
 * Forked at ref_send.js version: 2009-05-11
 *
 * With parts by Mark Miller
 * Copyright (C) 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

(function (definition) {
    "use strict";

    // This file will function properly as a <script> tag, or a module
    // using CommonJS and NodeJS or RequireJS module formats.  In
    // Common/Node/RequireJS, the module exports the Q API and when
    // executed as a simple <script>, it creates a Q global instead.

    // Montage Require
    if (typeof bootstrap === "function") {
        bootstrap("promise", definition);

    // CommonJS
    } else if (typeof exports === "object" && typeof module === "object") {
        module.exports = definition();

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
        define(definition);

    // SES (Secure EcmaScript)
    } else if (typeof ses !== "undefined") {
        if (!ses.ok()) {
            return;
        } else {
            ses.makeQ = definition;
        }

    // <script>
    } else if (typeof window !== "undefined" || typeof self !== "undefined") {
        // Prefer window over self for add-on scripts. Use self for
        // non-windowed contexts.
        var global = typeof window !== "undefined" ? window : self;

        // Get the `window` object, save the previous Q global
        // and initialize Q as a global.
        var previousQ = global.Q;
        global.Q = definition();

        // Add a noConflict function so Q can be removed from the
        // global namespace.
        global.Q.noConflict = function () {
            global.Q = previousQ;
            return this;
        };

    } else {
        throw new Error("This environment was not anticipated by Q. Please file a bug.");
    }

})(function () {
"use strict";

var hasStacks = false;
try {
    throw new Error();
} catch (e) {
    hasStacks = !!e.stack;
}

// All code after this point will be filtered from stack traces reported
// by Q.
var qStartingLine = captureLine();
var qFileName;

// shims

// used for fallback in "allResolved"
var noop = function () {};

// Use the fastest possible means to execute a task in a future turn
// of the event loop.
var nextTick =(function () {
    // linked list of tasks (single, with head node)
    var head = {task: void 0, next: null};
    var tail = head;
    var flushing = false;
    var requestTick = void 0;
    var isNodeJS = false;
    // queue for late tasks, used by unhandled rejection tracking
    var laterQueue = [];

    function flush() {
        /* jshint loopfunc: true */
        var task, domain;

        while (head.next) {
            head = head.next;
            task = head.task;
            head.task = void 0;
            domain = head.domain;

            if (domain) {
                head.domain = void 0;
                domain.enter();
            }
            runSingle(task, domain);

        }
        while (laterQueue.length) {
            task = laterQueue.pop();
            runSingle(task);
        }
        flushing = false;
    }
    // runs a single function in the async queue
    function runSingle(task, domain) {
        try {
            task();

        } catch (e) {
            if (isNodeJS) {
                // In node, uncaught exceptions are considered fatal errors.
                // Re-throw them synchronously to interrupt flushing!

                // Ensure continuation if the uncaught exception is suppressed
                // listening "uncaughtException" events (as domains does).
                // Continue in next event to avoid tick recursion.
                if (domain) {
                    domain.exit();
                }
                setTimeout(flush, 0);
                if (domain) {
                    domain.enter();
                }

                throw e;

            } else {
                // In browsers, uncaught exceptions are not fatal.
                // Re-throw them asynchronously to avoid slow-downs.
                setTimeout(function () {
                    throw e;
                }, 0);
            }
        }

        if (domain) {
            domain.exit();
        }
    }

    nextTick = function (task) {
        tail = tail.next = {
            task: task,
            domain: isNodeJS && process.domain,
            next: null
        };

        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };

    if (typeof process === "object" &&
        process.toString() === "[object process]" && process.nextTick) {
        // Ensure Q is in a real Node environment, with a `process.nextTick`.
        // To see through fake Node environments:
        // * Mocha test runner - exposes a `process` global without a `nextTick`
        // * Browserify - exposes a `process.nexTick` function that uses
        //   `setTimeout`. In this case `setImmediate` is preferred because
        //    it is faster. Browserify's `process.toString()` yields
        //   "[object Object]", while in a real Node environment
        //   `process.nextTick()` yields "[object process]".
        isNodeJS = true;

        requestTick = function () {
            process.nextTick(flush);
        };

    } else if (typeof setImmediate === "function") {
        // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
        if (typeof window !== "undefined") {
            requestTick = setImmediate.bind(window, flush);
        } else {
            requestTick = function () {
                setImmediate(flush);
            };
        }

    } else if (typeof MessageChannel !== "undefined") {
        // modern browsers
        // http://www.nonblocking.io/2011/06/windownexttick.html
        var channel = new MessageChannel();
        // At least Safari Version 6.0.5 (8536.30.1) intermittently cannot create
        // working message ports the first time a page loads.
        channel.port1.onmessage = function () {
            requestTick = requestPortTick;
            channel.port1.onmessage = flush;
            flush();
        };
        var requestPortTick = function () {
            // Opera requires us to provide a message payload, regardless of
            // whether we use it.
            channel.port2.postMessage(0);
        };
        requestTick = function () {
            setTimeout(flush, 0);
            requestPortTick();
        };

    } else {
        // old browsers
        requestTick = function () {
            setTimeout(flush, 0);
        };
    }
    // runs a task after all other tasks have been run
    // this is useful for unhandled rejection tracking that needs to happen
    // after all `then`d tasks have been run.
    nextTick.runAfter = function (task) {
        laterQueue.push(task);
        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };
    return nextTick;
})();

// Attempt to make generics safe in the face of downstream
// modifications.
// There is no situation where this is necessary.
// If you need a security guarantee, these primordials need to be
// deeply frozen anyway, and if you don’t need a security guarantee,
// this is just plain paranoid.
// However, this **might** have the nice side-effect of reducing the size of
// the minified code by reducing x.call() to merely x()
// See Mark Miller’s explanation of what this does.
// http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
var call = Function.call;
function uncurryThis(f) {
    return function () {
        return call.apply(f, arguments);
    };
}
// This is equivalent, but slower:
// uncurryThis = Function_bind.bind(Function_bind.call);
// http://jsperf.com/uncurrythis

var array_slice = uncurryThis(Array.prototype.slice);

var array_reduce = uncurryThis(
    Array.prototype.reduce || function (callback, basis) {
        var index = 0,
            length = this.length;
        // concerning the initial value, if one is not provided
        if (arguments.length === 1) {
            // seek to the first value in the array, accounting
            // for the possibility that is is a sparse array
            do {
                if (index in this) {
                    basis = this[index++];
                    break;
                }
                if (++index >= length) {
                    throw new TypeError();
                }
            } while (1);
        }
        // reduce
        for (; index < length; index++) {
            // account for the possibility that the array is sparse
            if (index in this) {
                basis = callback(basis, this[index], index);
            }
        }
        return basis;
    }
);

var array_indexOf = uncurryThis(
    Array.prototype.indexOf || function (value) {
        // not a very good shim, but good enough for our one use of it
        for (var i = 0; i < this.length; i++) {
            if (this[i] === value) {
                return i;
            }
        }
        return -1;
    }
);

var array_map = uncurryThis(
    Array.prototype.map || function (callback, thisp) {
        var self = this;
        var collect = [];
        array_reduce(self, function (undefined, value, index) {
            collect.push(callback.call(thisp, value, index, self));
        }, void 0);
        return collect;
    }
);

var object_create = Object.create || function (prototype) {
    function Type() { }
    Type.prototype = prototype;
    return new Type();
};

var object_hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

var object_keys = Object.keys || function (object) {
    var keys = [];
    for (var key in object) {
        if (object_hasOwnProperty(object, key)) {
            keys.push(key);
        }
    }
    return keys;
};

var object_toString = uncurryThis(Object.prototype.toString);

function isObject(value) {
    return value === Object(value);
}

// generator related shims

// FIXME: Remove this function once ES6 generators are in SpiderMonkey.
function isStopIteration(exception) {
    return (
        object_toString(exception) === "[object StopIteration]" ||
        exception instanceof QReturnValue
    );
}

// FIXME: Remove this helper and Q.return once ES6 generators are in
// SpiderMonkey.
var QReturnValue;
if (typeof ReturnValue !== "undefined") {
    QReturnValue = ReturnValue;
} else {
    QReturnValue = function (value) {
        this.value = value;
    };
}

// long stack traces

var STACK_JUMP_SEPARATOR = "From previous event:";

function makeStackTraceLong(error, promise) {
    // If possible, transform the error stack trace by removing Node and Q
    // cruft, then concatenating with the stack trace of `promise`. See #57.
    if (hasStacks &&
        promise.stack &&
        typeof error === "object" &&
        error !== null &&
        error.stack &&
        error.stack.indexOf(STACK_JUMP_SEPARATOR) === -1
    ) {
        var stacks = [];
        for (var p = promise; !!p; p = p.source) {
            if (p.stack) {
                stacks.unshift(p.stack);
            }
        }
        stacks.unshift(error.stack);

        var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
        error.stack = filterStackString(concatedStacks);
    }
}

function filterStackString(stackString) {
    var lines = stackString.split("\n");
    var desiredLines = [];
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];

        if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
            desiredLines.push(line);
        }
    }
    return desiredLines.join("\n");
}

function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 ||
           stackLine.indexOf("(node.js:") !== -1;
}

function getFileNameAndLineNumber(stackLine) {
    // Named functions: "at functionName (filename:lineNumber:columnNumber)"
    // In IE10 function name can have spaces ("Anonymous function") O_o
    var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
    if (attempt1) {
        return [attempt1[1], Number(attempt1[2])];
    }

    // Anonymous functions: "at filename:lineNumber:columnNumber"
    var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
    if (attempt2) {
        return [attempt2[1], Number(attempt2[2])];
    }

    // Firefox style: "function@filename:lineNumber or @filename:lineNumber"
    var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
    if (attempt3) {
        return [attempt3[1], Number(attempt3[2])];
    }
}

function isInternalFrame(stackLine) {
    var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);

    if (!fileNameAndLineNumber) {
        return false;
    }

    var fileName = fileNameAndLineNumber[0];
    var lineNumber = fileNameAndLineNumber[1];

    return fileName === qFileName &&
        lineNumber >= qStartingLine &&
        lineNumber <= qEndingLine;
}

// discover own file name and line number range for filtering stack
// traces
function captureLine() {
    if (!hasStacks) {
        return;
    }

    try {
        throw new Error();
    } catch (e) {
        var lines = e.stack.split("\n");
        var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
        var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
        if (!fileNameAndLineNumber) {
            return;
        }

        qFileName = fileNameAndLineNumber[0];
        return fileNameAndLineNumber[1];
    }
}

function deprecate(callback, name, alternative) {
    return function () {
        if (typeof console !== "undefined" &&
            typeof console.warn === "function") {
            console.warn(name + " is deprecated, use " + alternative +
                         " instead.", new Error("").stack);
        }
        return callback.apply(callback, arguments);
    };
}

// end of shims
// beginning of real work

/**
 * Constructs a promise for an immediate reference, passes promises through, or
 * coerces promises from different systems.
 * @param value immediate reference or promise
 */
function Q(value) {
    // If the object is already a Promise, return it directly.  This enables
    // the resolve function to both be used to created references from objects,
    // but to tolerably coerce non-promises to promises.
    if (value instanceof Promise) {
        return value;
    }

    // assimilate thenables
    if (isPromiseAlike(value)) {
        return coerce(value);
    } else {
        return fulfill(value);
    }
}
Q.resolve = Q;

/**
 * Performs a task in a future turn of the event loop.
 * @param {Function} task
 */
Q.nextTick = nextTick;

/**
 * Controls whether or not long stack traces will be on
 */
Q.longStackSupport = false;

// enable long stacks if Q_DEBUG is set
if (typeof process === "object" && process && process.env && process.env.Q_DEBUG) {
    Q.longStackSupport = true;
}

/**
 * Constructs a {promise, resolve, reject} object.
 *
 * `resolve` is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke `resolve` with any value that is
 * not a thenable. To reject the promise, invoke `resolve` with a rejected
 * thenable, or invoke `reject` with the reason directly. To resolve the
 * promise to another thenable, thus putting it in the same state, invoke
 * `resolve` with that other thenable.
 */
Q.defer = defer;
function defer() {
    // if "messages" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the messages array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the `resolve` function because it handles both fully
    // non-thenable values and other thenables gracefully.
    var messages = [], progressListeners = [], resolvedPromise;

    var deferred = object_create(defer.prototype);
    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, operands) {
        var args = array_slice(arguments);
        if (messages) {
            messages.push(args);
            if (op === "when" && operands[1]) { // progress operand
                progressListeners.push(operands[1]);
            }
        } else {
            Q.nextTick(function () {
                resolvedPromise.promiseDispatch.apply(resolvedPromise, args);
            });
        }
    };

    // XXX deprecated
    promise.valueOf = function () {
        if (messages) {
            return promise;
        }
        var nearerValue = nearer(resolvedPromise);
        if (isPromise(nearerValue)) {
            resolvedPromise = nearerValue; // shorten chain
        }
        return nearerValue;
    };

    promise.inspect = function () {
        if (!resolvedPromise) {
            return { state: "pending" };
        }
        return resolvedPromise.inspect();
    };

    if (Q.longStackSupport && hasStacks) {
        try {
            throw new Error();
        } catch (e) {
            // NOTE: don't try to use `Error.captureStackTrace` or transfer the
            // accessor around; that causes memory leaks as per GH-111. Just
            // reify the stack trace as a string ASAP.
            //
            // At the same time, cut off the first line; it's always just
            // "[object Promise]\n", as per the `toString`.
            promise.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
        }
    }

    // NOTE: we do the checks for `resolvedPromise` in each method, instead of
    // consolidating them into `become`, since otherwise we'd create new
    // promises with the lines `become(whatever(value))`. See e.g. GH-252.

    function become(newPromise) {
        resolvedPromise = newPromise;
        promise.source = newPromise;

        array_reduce(messages, function (undefined, message) {
            Q.nextTick(function () {
                newPromise.promiseDispatch.apply(newPromise, message);
            });
        }, void 0);

        messages = void 0;
        progressListeners = void 0;
    }

    deferred.promise = promise;
    deferred.resolve = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(Q(value));
    };

    deferred.fulfill = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(fulfill(value));
    };
    deferred.reject = function (reason) {
        if (resolvedPromise) {
            return;
        }

        become(reject(reason));
    };
    deferred.notify = function (progress) {
        if (resolvedPromise) {
            return;
        }

        array_reduce(progressListeners, function (undefined, progressListener) {
            Q.nextTick(function () {
                progressListener(progress);
            });
        }, void 0);
    };

    return deferred;
}

/**
 * Creates a Node-style callback that will resolve or reject the deferred
 * promise.
 * @returns a nodeback
 */
defer.prototype.makeNodeResolver = function () {
    var self = this;
    return function (error, value) {
        if (error) {
            self.reject(error);
        } else if (arguments.length > 2) {
            self.resolve(array_slice(arguments, 1));
        } else {
            self.resolve(value);
        }
    };
};

/**
 * @param resolver {Function} a function that returns nothing and accepts
 * the resolve, reject, and notify functions for a deferred.
 * @returns a promise that may be resolved with the given resolve and reject
 * functions, or rejected by a thrown exception in resolver
 */
Q.Promise = promise; // ES6
Q.promise = promise;
function promise(resolver) {
    if (typeof resolver !== "function") {
        throw new TypeError("resolver must be a function.");
    }
    var deferred = defer();
    try {
        resolver(deferred.resolve, deferred.reject, deferred.notify);
    } catch (reason) {
        deferred.reject(reason);
    }
    return deferred.promise;
}

promise.race = race; // ES6
promise.all = all; // ES6
promise.reject = reject; // ES6
promise.resolve = Q; // ES6

// XXX experimental.  This method is a way to denote that a local value is
// serializable and should be immediately dispatched to a remote upon request,
// instead of passing a reference.
Q.passByCopy = function (object) {
    //freeze(object);
    //passByCopies.set(object, true);
    return object;
};

Promise.prototype.passByCopy = function () {
    //freeze(object);
    //passByCopies.set(object, true);
    return this;
};

/**
 * If two promises eventually fulfill to the same value, promises that value,
 * but otherwise rejects.
 * @param x {Any*}
 * @param y {Any*}
 * @returns {Any*} a promise for x and y if they are the same, but a rejection
 * otherwise.
 *
 */
Q.join = function (x, y) {
    return Q(x).join(y);
};

Promise.prototype.join = function (that) {
    return Q([this, that]).spread(function (x, y) {
        if (x === y) {
            // TODO: "===" should be Object.is or equiv
            return x;
        } else {
            throw new Error("Can't join: not the same: " + x + " " + y);
        }
    });
};

/**
 * Returns a promise for the first of an array of promises to become settled.
 * @param answers {Array[Any*]} promises to race
 * @returns {Any*} the first promise to be settled
 */
Q.race = race;
function race(answerPs) {
    return promise(function (resolve, reject) {
        // Switch to this once we can assume at least ES5
        // answerPs.forEach(function (answerP) {
        //     Q(answerP).then(resolve, reject);
        // });
        // Use this in the meantime
        for (var i = 0, len = answerPs.length; i < len; i++) {
            Q(answerPs[i]).then(resolve, reject);
        }
    });
}

Promise.prototype.race = function () {
    return this.then(Q.race);
};

/**
 * Constructs a Promise with a promise descriptor object and optional fallback
 * function.  The descriptor contains methods like when(rejected), get(name),
 * set(name, value), post(name, args), and delete(name), which all
 * return either a value, a promise for a value, or a rejection.  The fallback
 * accepts the operation name, a resolver, and any further arguments that would
 * have been forwarded to the appropriate method above had a method been
 * provided with the proper name.  The API makes no guarantees about the nature
 * of the returned object, apart from that it is usable whereever promises are
 * bought and sold.
 */
Q.makePromise = Promise;
function Promise(descriptor, fallback, inspect) {
    if (fallback === void 0) {
        fallback = function (op) {
            return reject(new Error(
                "Promise does not support operation: " + op
            ));
        };
    }
    if (inspect === void 0) {
        inspect = function () {
            return {state: "unknown"};
        };
    }

    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, args) {
        var result;
        try {
            if (descriptor[op]) {
                result = descriptor[op].apply(promise, args);
            } else {
                result = fallback.call(promise, op, args);
            }
        } catch (exception) {
            result = reject(exception);
        }
        if (resolve) {
            resolve(result);
        }
    };

    promise.inspect = inspect;

    // XXX deprecated `valueOf` and `exception` support
    if (inspect) {
        var inspected = inspect();
        if (inspected.state === "rejected") {
            promise.exception = inspected.reason;
        }

        promise.valueOf = function () {
            var inspected = inspect();
            if (inspected.state === "pending" ||
                inspected.state === "rejected") {
                return promise;
            }
            return inspected.value;
        };
    }

    return promise;
}

Promise.prototype.toString = function () {
    return "[object Promise]";
};

Promise.prototype.then = function (fulfilled, rejected, progressed) {
    var self = this;
    var deferred = defer();
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks

    function _fulfilled(value) {
        try {
            return typeof fulfilled === "function" ? fulfilled(value) : value;
        } catch (exception) {
            return reject(exception);
        }
    }

    function _rejected(exception) {
        if (typeof rejected === "function") {
            makeStackTraceLong(exception, self);
            try {
                return rejected(exception);
            } catch (newException) {
                return reject(newException);
            }
        }
        return reject(exception);
    }

    function _progressed(value) {
        return typeof progressed === "function" ? progressed(value) : value;
    }

    Q.nextTick(function () {
        self.promiseDispatch(function (value) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_fulfilled(value));
        }, "when", [function (exception) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_rejected(exception));
        }]);
    });

    // Progress propagator need to be attached in the current tick.
    self.promiseDispatch(void 0, "when", [void 0, function (value) {
        var newValue;
        var threw = false;
        try {
            newValue = _progressed(value);
        } catch (e) {
            threw = true;
            if (Q.onerror) {
                Q.onerror(e);
            } else {
                throw e;
            }
        }

        if (!threw) {
            deferred.notify(newValue);
        }
    }]);

    return deferred.promise;
};

Q.tap = function (promise, callback) {
    return Q(promise).tap(callback);
};

/**
 * Works almost like "finally", but not called for rejections.
 * Original resolution value is passed through callback unaffected.
 * Callback may return a promise that will be awaited for.
 * @param {Function} callback
 * @returns {Q.Promise}
 * @example
 * doSomething()
 *   .then(...)
 *   .tap(console.log)
 *   .then(...);
 */
Promise.prototype.tap = function (callback) {
    callback = Q(callback);

    return this.then(function (value) {
        return callback.fcall(value).thenResolve(value);
    });
};

/**
 * Registers an observer on a promise.
 *
 * Guarantees:
 *
 * 1. that fulfilled and rejected will be called only once.
 * 2. that either the fulfilled callback or the rejected callback will be
 *    called, but not both.
 * 3. that fulfilled and rejected will not be called in this turn.
 *
 * @param value      promise or immediate reference to observe
 * @param fulfilled  function to be called with the fulfilled value
 * @param rejected   function to be called with the rejection exception
 * @param progressed function to be called on any progress notifications
 * @return promise for the return value from the invoked callback
 */
Q.when = when;
function when(value, fulfilled, rejected, progressed) {
    return Q(value).then(fulfilled, rejected, progressed);
}

Promise.prototype.thenResolve = function (value) {
    return this.then(function () { return value; });
};

Q.thenResolve = function (promise, value) {
    return Q(promise).thenResolve(value);
};

Promise.prototype.thenReject = function (reason) {
    return this.then(function () { throw reason; });
};

Q.thenReject = function (promise, reason) {
    return Q(promise).thenReject(reason);
};

/**
 * If an object is not a promise, it is as "near" as possible.
 * If a promise is rejected, it is as "near" as possible too.
 * If it’s a fulfilled promise, the fulfillment value is nearer.
 * If it’s a deferred promise and the deferred has been resolved, the
 * resolution is "nearer".
 * @param object
 * @returns most resolved (nearest) form of the object
 */

// XXX should we re-do this?
Q.nearer = nearer;
function nearer(value) {
    if (isPromise(value)) {
        var inspected = value.inspect();
        if (inspected.state === "fulfilled") {
            return inspected.value;
        }
    }
    return value;
}

/**
 * @returns whether the given object is a promise.
 * Otherwise it is a fulfilled value.
 */
Q.isPromise = isPromise;
function isPromise(object) {
    return object instanceof Promise;
}

Q.isPromiseAlike = isPromiseAlike;
function isPromiseAlike(object) {
    return isObject(object) && typeof object.then === "function";
}

/**
 * @returns whether the given object is a pending promise, meaning not
 * fulfilled or rejected.
 */
Q.isPending = isPending;
function isPending(object) {
    return isPromise(object) && object.inspect().state === "pending";
}

Promise.prototype.isPending = function () {
    return this.inspect().state === "pending";
};

/**
 * @returns whether the given object is a value or fulfilled
 * promise.
 */
Q.isFulfilled = isFulfilled;
function isFulfilled(object) {
    return !isPromise(object) || object.inspect().state === "fulfilled";
}

Promise.prototype.isFulfilled = function () {
    return this.inspect().state === "fulfilled";
};

/**
 * @returns whether the given object is a rejected promise.
 */
Q.isRejected = isRejected;
function isRejected(object) {
    return isPromise(object) && object.inspect().state === "rejected";
}

Promise.prototype.isRejected = function () {
    return this.inspect().state === "rejected";
};

//// BEGIN UNHANDLED REJECTION TRACKING

// This promise library consumes exceptions thrown in handlers so they can be
// handled by a subsequent promise.  The exceptions get added to this array when
// they are created, and removed when they are handled.  Note that in ES6 or
// shimmed environments, this would naturally be a `Set`.
var unhandledReasons = [];
var unhandledRejections = [];
var reportedUnhandledRejections = [];
var trackUnhandledRejections = true;

function resetUnhandledRejections() {
    unhandledReasons.length = 0;
    unhandledRejections.length = 0;

    if (!trackUnhandledRejections) {
        trackUnhandledRejections = true;
    }
}

function trackRejection(promise, reason) {
    if (!trackUnhandledRejections) {
        return;
    }
    if (typeof process === "object" && typeof process.emit === "function") {
        Q.nextTick.runAfter(function () {
            if (array_indexOf(unhandledRejections, promise) !== -1) {
                process.emit("unhandledRejection", reason, promise);
                reportedUnhandledRejections.push(promise);
            }
        });
    }

    unhandledRejections.push(promise);
    if (reason && typeof reason.stack !== "undefined") {
        unhandledReasons.push(reason.stack);
    } else {
        unhandledReasons.push("(no stack) " + reason);
    }
}

function untrackRejection(promise) {
    if (!trackUnhandledRejections) {
        return;
    }

    var at = array_indexOf(unhandledRejections, promise);
    if (at !== -1) {
        if (typeof process === "object" && typeof process.emit === "function") {
            Q.nextTick.runAfter(function () {
                var atReport = array_indexOf(reportedUnhandledRejections, promise);
                if (atReport !== -1) {
                    process.emit("rejectionHandled", unhandledReasons[at], promise);
                    reportedUnhandledRejections.splice(atReport, 1);
                }
            });
        }
        unhandledRejections.splice(at, 1);
        unhandledReasons.splice(at, 1);
    }
}

Q.resetUnhandledRejections = resetUnhandledRejections;

Q.getUnhandledReasons = function () {
    // Make a copy so that consumers can't interfere with our internal state.
    return unhandledReasons.slice();
};

Q.stopUnhandledRejectionTracking = function () {
    resetUnhandledRejections();
    trackUnhandledRejections = false;
};

resetUnhandledRejections();

//// END UNHANDLED REJECTION TRACKING

/**
 * Constructs a rejected promise.
 * @param reason value describing the failure
 */
Q.reject = reject;
function reject(reason) {
    var rejection = Promise({
        "when": function (rejected) {
            // note that the error has been handled
            if (rejected) {
                untrackRejection(this);
            }
            return rejected ? rejected(reason) : this;
        }
    }, function fallback() {
        return this;
    }, function inspect() {
        return { state: "rejected", reason: reason };
    });

    // Note that the reason has not been handled.
    trackRejection(rejection, reason);

    return rejection;
}

/**
 * Constructs a fulfilled promise for an immediate reference.
 * @param value immediate reference
 */
Q.fulfill = fulfill;
function fulfill(value) {
    return Promise({
        "when": function () {
            return value;
        },
        "get": function (name) {
            return value[name];
        },
        "set": function (name, rhs) {
            value[name] = rhs;
        },
        "delete": function (name) {
            delete value[name];
        },
        "post": function (name, args) {
            // Mark Miller proposes that post with no name should apply a
            // promised function.
            if (name === null || name === void 0) {
                return value.apply(void 0, args);
            } else {
                return value[name].apply(value, args);
            }
        },
        "apply": function (thisp, args) {
            return value.apply(thisp, args);
        },
        "keys": function () {
            return object_keys(value);
        }
    }, void 0, function inspect() {
        return { state: "fulfilled", value: value };
    });
}

/**
 * Converts thenables to Q promises.
 * @param promise thenable promise
 * @returns a Q promise
 */
function coerce(promise) {
    var deferred = defer();
    Q.nextTick(function () {
        try {
            promise.then(deferred.resolve, deferred.reject, deferred.notify);
        } catch (exception) {
            deferred.reject(exception);
        }
    });
    return deferred.promise;
}

/**
 * Annotates an object such that it will never be
 * transferred away from this process over any promise
 * communication channel.
 * @param object
 * @returns promise a wrapping of that object that
 * additionally responds to the "isDef" message
 * without a rejection.
 */
Q.master = master;
function master(object) {
    return Promise({
        "isDef": function () {}
    }, function fallback(op, args) {
        return dispatch(object, op, args);
    }, function () {
        return Q(object).inspect();
    });
}

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param fulfilled callback that receives variadic arguments from the
 * promised array
 * @param rejected callback that receives the exception if the promise
 * is rejected.
 * @returns a promise for the return value or thrown exception of
 * either callback.
 */
Q.spread = spread;
function spread(value, fulfilled, rejected) {
    return Q(value).spread(fulfilled, rejected);
}

Promise.prototype.spread = function (fulfilled, rejected) {
    return this.all().then(function (array) {
        return fulfilled.apply(void 0, array);
    }, rejected);
};

/**
 * The async function is a decorator for generator functions, turning
 * them into asynchronous generators.  Although generators are only part
 * of the newest ECMAScript 6 drafts, this code does not cause syntax
 * errors in older engines.  This code should continue to work and will
 * in fact improve over time as the language improves.
 *
 * ES6 generators are currently part of V8 version 3.19 with the
 * --harmony-generators runtime flag enabled.  SpiderMonkey has had them
 * for longer, but under an older Python-inspired form.  This function
 * works on both kinds of generators.
 *
 * Decorates a generator function such that:
 *  - it may yield promises
 *  - execution will continue when that promise is fulfilled
 *  - the value of the yield expression will be the fulfilled value
 *  - it returns a promise for the return value (when the generator
 *    stops iterating)
 *  - the decorated function returns a promise for the return value
 *    of the generator or the first rejected promise among those
 *    yielded.
 *  - if an error is thrown in the generator, it propagates through
 *    every following yield until it is caught, or until it escapes
 *    the generator function altogether, and is translated into a
 *    rejection for the promise returned by the decorated generator.
 */
Q.async = async;
function async(makeGenerator) {
    return function () {
        // when verb is "send", arg is a value
        // when verb is "throw", arg is an exception
        function continuer(verb, arg) {
            var result;

            // Until V8 3.19 / Chromium 29 is released, SpiderMonkey is the only
            // engine that has a deployed base of browsers that support generators.
            // However, SM's generators use the Python-inspired semantics of
            // outdated ES6 drafts.  We would like to support ES6, but we'd also
            // like to make it possible to use generators in deployed browsers, so
            // we also support Python-style generators.  At some point we can remove
            // this block.

            if (typeof StopIteration === "undefined") {
                // ES6 Generators
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    return reject(exception);
                }
                if (result.done) {
                    return Q(result.value);
                } else {
                    return when(result.value, callback, errback);
                }
            } else {
                // SpiderMonkey Generators
                // FIXME: Remove this case when SM does ES6 generators.
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    if (isStopIteration(exception)) {
                        return Q(exception.value);
                    } else {
                        return reject(exception);
                    }
                }
                return when(result, callback, errback);
            }
        }
        var generator = makeGenerator.apply(this, arguments);
        var callback = continuer.bind(continuer, "next");
        var errback = continuer.bind(continuer, "throw");
        return callback();
    };
}

/**
 * The spawn function is a small wrapper around async that immediately
 * calls the generator and also ends the promise chain, so that any
 * unhandled errors are thrown instead of forwarded to the error
 * handler. This is useful because it's extremely common to run
 * generators at the top-level to work with libraries.
 */
Q.spawn = spawn;
function spawn(makeGenerator) {
    Q.done(Q.async(makeGenerator)());
}

// FIXME: Remove this interface once ES6 generators are in SpiderMonkey.
/**
 * Throws a ReturnValue exception to stop an asynchronous generator.
 *
 * This interface is a stop-gap measure to support generator return
 * values in older Firefox/SpiderMonkey.  In browsers that support ES6
 * generators like Chromium 29, just use "return" in your generator
 * functions.
 *
 * @param value the return value for the surrounding generator
 * @throws ReturnValue exception with the value.
 * @example
 * // ES6 style
 * Q.async(function* () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      return foo + bar;
 * })
 * // Older SpiderMonkey style
 * Q.async(function () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      Q.return(foo + bar);
 * })
 */
Q["return"] = _return;
function _return(value) {
    throw new QReturnValue(value);
}

/**
 * The promised function decorator ensures that any promise arguments
 * are settled and passed as values (`this` is also settled and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Q.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Q(a), Q(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
Q.promised = promised;
function promised(callback) {
    return function () {
        return spread([this, all(arguments)], function (self, args) {
            return callback.apply(self, args);
        });
    };
}

/**
 * sends a message to a value in a future turn
 * @param object* the recipient
 * @param op the name of the message operation, e.g., "when",
 * @param args further arguments to be forwarded to the operation
 * @returns result {Promise} a promise for the result of the operation
 */
Q.dispatch = dispatch;
function dispatch(object, op, args) {
    return Q(object).dispatch(op, args);
}

Promise.prototype.dispatch = function (op, args) {
    var self = this;
    var deferred = defer();
    Q.nextTick(function () {
        self.promiseDispatch(deferred.resolve, op, args);
    });
    return deferred.promise;
};

/**
 * Gets the value of a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to get
 * @return promise for the property value
 */
Q.get = function (object, key) {
    return Q(object).dispatch("get", [key]);
};

Promise.prototype.get = function (key) {
    return this.dispatch("get", [key]);
};

/**
 * Sets the value of a property in a future turn.
 * @param object    promise or immediate reference for object object
 * @param name      name of property to set
 * @param value     new value of property
 * @return promise for the return value
 */
Q.set = function (object, key, value) {
    return Q(object).dispatch("set", [key, value]);
};

Promise.prototype.set = function (key, value) {
    return this.dispatch("set", [key, value]);
};

/**
 * Deletes a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to delete
 * @return promise for the return value
 */
Q.del = // XXX legacy
Q["delete"] = function (object, key) {
    return Q(object).dispatch("delete", [key]);
};

Promise.prototype.del = // XXX legacy
Promise.prototype["delete"] = function (key) {
    return this.dispatch("delete", [key]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param value     a value to post, typically an array of
 *                  invocation arguments for promises that
 *                  are ultimately backed with `resolve` values,
 *                  as opposed to those backed with URLs
 *                  wherein the posted value can be any
 *                  JSON serializable object.
 * @return promise for the return value
 */
// bound locally because it is used by other methods
Q.mapply = // XXX As proposed by "Redsandro"
Q.post = function (object, name, args) {
    return Q(object).dispatch("post", [name, args]);
};

Promise.prototype.mapply = // XXX As proposed by "Redsandro"
Promise.prototype.post = function (name, args) {
    return this.dispatch("post", [name, args]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param ...args   array of invocation arguments
 * @return promise for the return value
 */
Q.send = // XXX Mark Miller's proposed parlance
Q.mcall = // XXX As proposed by "Redsandro"
Q.invoke = function (object, name /*...args*/) {
    return Q(object).dispatch("post", [name, array_slice(arguments, 2)]);
};

Promise.prototype.send = // XXX Mark Miller's proposed parlance
Promise.prototype.mcall = // XXX As proposed by "Redsandro"
Promise.prototype.invoke = function (name /*...args*/) {
    return this.dispatch("post", [name, array_slice(arguments, 1)]);
};

/**
 * Applies the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param args      array of application arguments
 */
Q.fapply = function (object, args) {
    return Q(object).dispatch("apply", [void 0, args]);
};

Promise.prototype.fapply = function (args) {
    return this.dispatch("apply", [void 0, args]);
};

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q["try"] =
Q.fcall = function (object /* ...args*/) {
    return Q(object).dispatch("apply", [void 0, array_slice(arguments, 1)]);
};

Promise.prototype.fcall = function (/*...args*/) {
    return this.dispatch("apply", [void 0, array_slice(arguments)]);
};

/**
 * Binds the promised function, transforming return values into a fulfilled
 * promise and thrown errors into a rejected one.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q.fbind = function (object /*...args*/) {
    var promise = Q(object);
    var args = array_slice(arguments, 1);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};
Promise.prototype.fbind = function (/*...args*/) {
    var promise = this;
    var args = array_slice(arguments);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};

/**
 * Requests the names of the owned properties of a promised
 * object in a future turn.
 * @param object    promise or immediate reference for target object
 * @return promise for the keys of the eventually settled object
 */
Q.keys = function (object) {
    return Q(object).dispatch("keys", []);
};

Promise.prototype.keys = function () {
    return this.dispatch("keys", []);
};

/**
 * Turns an array of promises into a promise for an array.  If any of
 * the promises gets rejected, the whole array is rejected immediately.
 * @param {Array*} an array (or promise for an array) of values (or
 * promises for values)
 * @returns a promise for an array of the corresponding values
 */
// By Mark Miller
// http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
Q.all = all;
function all(promises) {
    return when(promises, function (promises) {
        var pendingCount = 0;
        var deferred = defer();
        array_reduce(promises, function (undefined, promise, index) {
            var snapshot;
            if (
                isPromise(promise) &&
                (snapshot = promise.inspect()).state === "fulfilled"
            ) {
                promises[index] = snapshot.value;
            } else {
                ++pendingCount;
                when(
                    promise,
                    function (value) {
                        promises[index] = value;
                        if (--pendingCount === 0) {
                            deferred.resolve(promises);
                        }
                    },
                    deferred.reject,
                    function (progress) {
                        deferred.notify({ index: index, value: progress });
                    }
                );
            }
        }, void 0);
        if (pendingCount === 0) {
            deferred.resolve(promises);
        }
        return deferred.promise;
    });
}

Promise.prototype.all = function () {
    return all(this);
};

/**
 * Returns the first resolved promise of an array. Prior rejected promises are
 * ignored.  Rejects only if all promises are rejected.
 * @param {Array*} an array containing values or promises for values
 * @returns a promise fulfilled with the value of the first resolved promise,
 * or a rejected promise if all promises are rejected.
 */
Q.any = any;

function any(promises) {
    if (promises.length === 0) {
        return Q.resolve();
    }

    var deferred = Q.defer();
    var pendingCount = 0;
    array_reduce(promises, function (prev, current, index) {
        var promise = promises[index];

        pendingCount++;

        when(promise, onFulfilled, onRejected, onProgress);
        function onFulfilled(result) {
            deferred.resolve(result);
        }
        function onRejected() {
            pendingCount--;
            if (pendingCount === 0) {
                deferred.reject(new Error(
                    "Can't get fulfillment value from any promise, all " +
                    "promises were rejected."
                ));
            }
        }
        function onProgress(progress) {
            deferred.notify({
                index: index,
                value: progress
            });
        }
    }, undefined);

    return deferred.promise;
}

Promise.prototype.any = function () {
    return any(this);
};

/**
 * Waits for all promises to be settled, either fulfilled or
 * rejected.  This is distinct from `all` since that would stop
 * waiting at the first rejection.  The promise returned by
 * `allResolved` will never be rejected.
 * @param promises a promise for an array (or an array) of promises
 * (or values)
 * @return a promise for an array of promises
 */
Q.allResolved = deprecate(allResolved, "allResolved", "allSettled");
function allResolved(promises) {
    return when(promises, function (promises) {
        promises = array_map(promises, Q);
        return when(all(array_map(promises, function (promise) {
            return when(promise, noop, noop);
        })), function () {
            return promises;
        });
    });
}

Promise.prototype.allResolved = function () {
    return allResolved(this);
};

/**
 * @see Promise#allSettled
 */
Q.allSettled = allSettled;
function allSettled(promises) {
    return Q(promises).allSettled();
}

/**
 * Turns an array of promises into a promise for an array of their states (as
 * returned by `inspect`) when they have all settled.
 * @param {Array[Any*]} values an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Array[State]} an array of states for the respective values.
 */
Promise.prototype.allSettled = function () {
    return this.then(function (promises) {
        return all(array_map(promises, function (promise) {
            promise = Q(promise);
            function regardless() {
                return promise.inspect();
            }
            return promise.then(regardless, regardless);
        }));
    });
};

/**
 * Captures the failure of a promise, giving an oportunity to recover
 * with a callback.  If the given promise is fulfilled, the returned
 * promise is fulfilled.
 * @param {Any*} promise for something
 * @param {Function} callback to fulfill the returned promise if the
 * given promise is rejected
 * @returns a promise for the return value of the callback
 */
Q.fail = // XXX legacy
Q["catch"] = function (object, rejected) {
    return Q(object).then(void 0, rejected);
};

Promise.prototype.fail = // XXX legacy
Promise.prototype["catch"] = function (rejected) {
    return this.then(void 0, rejected);
};

/**
 * Attaches a listener that can respond to progress notifications from a
 * promise's originating deferred. This listener receives the exact arguments
 * passed to ``deferred.notify``.
 * @param {Any*} promise for something
 * @param {Function} callback to receive any progress notifications
 * @returns the given promise, unchanged
 */
Q.progress = progress;
function progress(object, progressed) {
    return Q(object).then(void 0, void 0, progressed);
}

Promise.prototype.progress = function (progressed) {
    return this.then(void 0, void 0, progressed);
};

/**
 * Provides an opportunity to observe the settling of a promise,
 * regardless of whether the promise is fulfilled or rejected.  Forwards
 * the resolution to the returned promise when the callback is done.
 * The callback can return a promise to defer completion.
 * @param {Any*} promise
 * @param {Function} callback to observe the resolution of the given
 * promise, takes no arguments.
 * @returns a promise for the resolution of the given promise when
 * ``fin`` is done.
 */
Q.fin = // XXX legacy
Q["finally"] = function (object, callback) {
    return Q(object)["finally"](callback);
};

Promise.prototype.fin = // XXX legacy
Promise.prototype["finally"] = function (callback) {
    callback = Q(callback);
    return this.then(function (value) {
        return callback.fcall().then(function () {
            return value;
        });
    }, function (reason) {
        // TODO attempt to recycle the rejection with "this".
        return callback.fcall().then(function () {
            throw reason;
        });
    });
};

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as exceptions.
 * @param {Any*} promise at the end of a chain of promises
 * @returns nothing
 */
Q.done = function (object, fulfilled, rejected, progress) {
    return Q(object).done(fulfilled, rejected, progress);
};

Promise.prototype.done = function (fulfilled, rejected, progress) {
    var onUnhandledError = function (error) {
        // forward to a future turn so that ``when``
        // does not catch it and turn it into a rejection.
        Q.nextTick(function () {
            makeStackTraceLong(error, promise);
            if (Q.onerror) {
                Q.onerror(error);
            } else {
                throw error;
            }
        });
    };

    // Avoid unnecessary `nextTick`ing via an unnecessary `when`.
    var promise = fulfilled || rejected || progress ?
        this.then(fulfilled, rejected, progress) :
        this;

    if (typeof process === "object" && process && process.domain) {
        onUnhandledError = process.domain.bind(onUnhandledError);
    }

    promise.then(void 0, onUnhandledError);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @param {Any*} custom error message or Error object (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Q.timeout = function (object, ms, error) {
    return Q(object).timeout(ms, error);
};

Promise.prototype.timeout = function (ms, error) {
    var deferred = defer();
    var timeoutId = setTimeout(function () {
        if (!error || "string" === typeof error) {
            error = new Error(error || "Timed out after " + ms + " ms");
            error.code = "ETIMEDOUT";
        }
        deferred.reject(error);
    }, ms);

    this.then(function (value) {
        clearTimeout(timeoutId);
        deferred.resolve(value);
    }, function (exception) {
        clearTimeout(timeoutId);
        deferred.reject(exception);
    }, deferred.notify);

    return deferred.promise;
};

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Q.delay = function (object, timeout) {
    if (timeout === void 0) {
        timeout = object;
        object = void 0;
    }
    return Q(object).delay(timeout);
};

Promise.prototype.delay = function (timeout) {
    return this.then(function (value) {
        var deferred = defer();
        setTimeout(function () {
            deferred.resolve(value);
        }, timeout);
        return deferred.promise;
    });
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided as an array, and returns a promise.
 *
 *      Q.nfapply(FS.readFile, [__filename])
 *      .then(function (content) {
 *      })
 *
 */
Q.nfapply = function (callback, args) {
    return Q(callback).nfapply(args);
};

Promise.prototype.nfapply = function (args) {
    var deferred = defer();
    var nodeArgs = array_slice(args);
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided individually, and returns a promise.
 * @example
 * Q.nfcall(FS.readFile, __filename)
 * .then(function (content) {
 * })
 *
 */
Q.nfcall = function (callback /*...args*/) {
    var args = array_slice(arguments, 1);
    return Q(callback).nfapply(args);
};

Promise.prototype.nfcall = function (/*...args*/) {
    var nodeArgs = array_slice(arguments);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Wraps a NodeJS continuation passing function and returns an equivalent
 * version that returns a promise.
 * @example
 * Q.nfbind(FS.readFile, __filename)("utf-8")
 * .then(console.log)
 * .done()
 */
Q.nfbind =
Q.denodeify = function (callback /*...args*/) {
    var baseArgs = array_slice(arguments, 1);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        Q(callback).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nfbind =
Promise.prototype.denodeify = function (/*...args*/) {
    var args = array_slice(arguments);
    args.unshift(this);
    return Q.denodeify.apply(void 0, args);
};

Q.nbind = function (callback, thisp /*...args*/) {
    var baseArgs = array_slice(arguments, 2);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        function bound() {
            return callback.apply(thisp, arguments);
        }
        Q(bound).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nbind = function (/*thisp, ...args*/) {
    var args = array_slice(arguments, 0);
    args.unshift(this);
    return Q.nbind.apply(void 0, args);
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback with a given array of arguments, plus a provided callback.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param {Array} args arguments to pass to the method; the callback
 * will be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nmapply = // XXX As proposed by "Redsandro"
Q.npost = function (object, name, args) {
    return Q(object).npost(name, args);
};

Promise.prototype.nmapply = // XXX As proposed by "Redsandro"
Promise.prototype.npost = function (name, args) {
    var nodeArgs = array_slice(args || []);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nsend = // XXX Based on Mark Miller's proposed "send"
Q.nmcall = // XXX Based on "Redsandro's" proposal
Q.ninvoke = function (object, name /*...args*/) {
    var nodeArgs = array_slice(arguments, 2);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    Q(object).dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

Promise.prototype.nsend = // XXX Based on Mark Miller's proposed "send"
Promise.prototype.nmcall = // XXX Based on "Redsandro's" proposal
Promise.prototype.ninvoke = function (name /*...args*/) {
    var nodeArgs = array_slice(arguments, 1);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * If a function would like to support both Node continuation-passing-style and
 * promise-returning-style, it can end its internal promise chain with
 * `nodeify(nodeback)`, forwarding the optional nodeback argument.  If the user
 * elects to use a nodeback, the result will be sent there.  If they do not
 * pass a nodeback, they will receive the result promise.
 * @param object a result (or a promise for a result)
 * @param {Function} nodeback a Node.js-style callback
 * @returns either the promise or nothing
 */
Q.nodeify = nodeify;
function nodeify(object, nodeback) {
    return Q(object).nodeify(nodeback);
}

Promise.prototype.nodeify = function (nodeback) {
    if (nodeback) {
        this.then(function (value) {
            Q.nextTick(function () {
                nodeback(null, value);
            });
        }, function (error) {
            Q.nextTick(function () {
                nodeback(error);
            });
        });
    } else {
        return this;
    }
};

Q.noConflict = function() {
    throw new Error("Q.noConflict only works when Q is used as a global");
};

// All code before this point will be filtered from stack traces.
var qEndingLine = captureLine();

return Q;

});

}).call(this,_dereq_("c:\\Users\\coding\\Documents\\GitHub\\browser\\node_modules\\browserify\\node_modules\\process\\browser.js"))
},{"c:\\Users\\coding\\Documents\\GitHub\\browser\\node_modules\\browserify\\node_modules\\process\\browser.js":2}],4:[function(_dereq_,module,exports){
(function (process){
/**
 * Synthetic DOM events
 * @author yiminghe@gmail.com
 */
(function () {
    'use strict';

    var isMsPointerSupported = 'msPointerEnabled' in navigator;
    var isPointerSupported = 'pointerEnabled' in navigator;

    /*jshint quotmark:false*/
    var UA = (function () {
        var win = typeof window !== 'undefined' ? window : {},
            undef,
            doc = win.document,
            ua = win.navigator && win.navigator.userAgent || '';

        function numberify(s) {
            var c = 0;
            // convert '1.2.3.4' to 1.234
            return parseFloat(s.replace(/\./g, function () {
                return (c++ === 0) ? '.' : '';
            }));
        }

        function setTridentVersion(ua, UA) {
            var core, m;
            UA[core = 'trident'] = 0.1; // Trident detected, look for revision

            // Get the Trident's accurate version
            if ((m = ua.match(/Trident\/([\d.]*)/)) && m[1]) {
                UA[core] = numberify(m[1]);
            }

            UA.core = core;
        }

        function getIEVersion(ua) {
            var m, v;
            if ((m = ua.match(/MSIE ([^;]*)|Trident.*; rv(?:\s|:)?([0-9.]+)/)) &&
                (v = (m[1] || m[2]))) {
                return numberify(v);
            }
            return 0;
        }

        function getDescriptorFromUserAgent(ua) {
            var EMPTY = '',
                os,
                core = EMPTY,
                shell = EMPTY,
                m,
                IE_DETECT_RANGE = [6, 9],
                ieVersion,
                v,
                end,
                VERSION_PLACEHOLDER = '{{version}}',
                IE_DETECT_TPL = '<!--[if IE ' + VERSION_PLACEHOLDER + ']><' + 's></s><![endif]-->',
                div = doc && doc.createElement('div'),
                s = [];

            var UA = {
                /**
                 * webkit version
                 * @type undef|Number
                 *
                 */
                webkit: undef,
                /**
                 * trident version
                 * @type undef|Number
                 *
                 */
                trident: undef,
                /**
                 * gecko version
                 * @type undef|Number
                 *
                 */
                gecko: undef,
                /**
                 * presto version
                 * @type undef|Number
                 *
                 */
                presto: undef,
                /**
                 * chrome version
                 * @type undef|Number
                 *
                 */
                chrome: undef,
                /**
                 * safari version
                 * @type undef|Number
                 *
                 */
                safari: undef,
                /**
                 * firefox version
                 * @type undef|Number
                 *
                 */
                firefox: undef,
                /**
                 * ie version
                 * @type undef|Number
                 *
                 */
                ie: undef,
                /**
                 * ie document mode
                 * @type undef|Number
                 *
                 */
                ieMode: undef,
                /**
                 * opera version
                 * @type undef|Number
                 *
                 */
                opera: undef,
                /**
                 * mobile browser. apple, android.
                 * @type String
                 *
                 */
                mobile: undef,
                /**
                 * browser render engine name. webkit, trident
                 * @type String
                 *
                 */
                core: undef,
                /**
                 * browser shell name. ie, chrome, firefox
                 * @type String
                 *
                 */
                shell: undef,

                /**
                 * PhantomJS version number
                 * @type undef|Number
                 *
                 */
                phantomjs: undef,

                /**
                 * operating system. android, ios, linux, windows
                 * @type string
                 *
                 */
                os: undef,

                /**
                 * ipad ios version
                 * @type Number
                 *
                 */
                ipad: undef,
                /**
                 * iphone ios version
                 * @type Number
                 *
                 */
                iphone: undef,
                /**
                 * ipod ios
                 * @type Number
                 *
                 */
                ipod: undef,
                /**
                 * ios version
                 * @type Number
                 *
                 */
                ios: undef,

                /**
                 * android version
                 * @type Number
                 *
                 */
                android: undef,

                /**
                 * nodejs version
                 * @type Number
                 *
                 */
                nodejs: undef
            };

            // ejecta
            if (div && div.getElementsByTagName) {
                // try to use IE-Conditional-Comment detect IE more accurately
                // IE10 doesn't support this method, @ref: http://blogs.msdn.com/b/ie/archive/2011/07/06/html5-parsing-in-ie10.aspx
                div.innerHTML = IE_DETECT_TPL.replace(VERSION_PLACEHOLDER, '');
                s = div.getElementsByTagName('s');
            }

            if (s.length > 0) {
                setTridentVersion(ua, UA);

                // Detect the accurate version
                // ע�⣺
                //  UA.shell = ie, ��ʾ����� ie
                //  �� UA.ie = 7, ������������ ie7, ���п����� ie8 �ļ���ģʽ
                //  ���� ie8 �ļ���ģʽ����Ҫͨ�� documentMode ȥ�жϡ����˴������� UA.ie = 8, ����
                //  �ܶ�ű��жϻ�ʧ����Ϊ ie8 �ļ���ģʽ������Ϊ�� ie7 ��ͬ�����Ǻ� ie8 ��ͬ
                for (v = IE_DETECT_RANGE[0], end = IE_DETECT_RANGE[1]; v <= end; v++) {
                    div.innerHTML = IE_DETECT_TPL.replace(VERSION_PLACEHOLDER, v);
                    if (s.length > 0) {
                        UA[shell = 'ie'] = v;
                        break;
                    }
                }

                // https://github.com/kissyteam/kissy/issues/321
                // win8 embed app
                if (!UA.ie && (ieVersion = getIEVersion(ua))) {
                    UA[shell = 'ie'] = ieVersion;
                }
            } else {
                // WebKit
                // https://github.com/kissyteam/kissy/issues/545
                if (((m = ua.match(/AppleWebKit\/([\d.]*)/)) || (m = ua.match(/Safari\/([\d.]*)/))) && m[1]) {
                    UA[core = 'webkit'] = numberify(m[1]);

                    if ((m = ua.match(/OPR\/(\d+\.\d+)/)) && m[1]) {
                        UA[shell = 'opera'] = numberify(m[1]);
                    } else if ((m = ua.match(/Chrome\/([\d.]*)/)) && m[1]) {
                        UA[shell = 'chrome'] = numberify(m[1]);
                    } else if ((m = ua.match(/\/([\d.]*) Safari/)) && m[1]) {
                        UA[shell = 'safari'] = numberify(m[1]);
                    } else {
                        // default to mobile safari
                        UA.safari = UA.webkit;
                    }

                    // Apple Mobile
                    if (/ Mobile\//.test(ua) && ua.match(/iPad|iPod|iPhone/)) {
                        UA.mobile = 'apple'; // iPad, iPhone or iPod Touch

                        m = ua.match(/OS ([^\s]*)/);
                        if (m && m[1]) {
                            UA.ios = numberify(m[1].replace('_', '.'));
                        }
                        os = 'ios';
                        m = ua.match(/iPad|iPod|iPhone/);
                        if (m && m[0]) {
                            UA[m[0].toLowerCase()] = UA.ios;
                        }
                    } else if (/ Android/i.test(ua)) {
                        if (/Mobile/.test(ua)) {
                            os = UA.mobile = 'android';
                        }
                        m = ua.match(/Android ([^\s]*);/);
                        if (m && m[1]) {
                            UA.android = numberify(m[1]);
                        }
                    } else if ((m = ua.match(/NokiaN[^\/]*|Android \d\.\d|webOS\/\d\.\d/))) {
                        UA.mobile = m[0].toLowerCase(); // Nokia N-series, Android, webOS, ex: NokiaN95
                    }

                    if ((m = ua.match(/PhantomJS\/([^\s]*)/)) && m[1]) {
                        UA.phantomjs = numberify(m[1]);
                    }
                } else {
                    // Presto
                    // ref: http://www.useragentstring.com/pages/useragentstring.php
                    if ((m = ua.match(/Presto\/([\d.]*)/)) && m[1]) {
                        UA[core = 'presto'] = numberify(m[1]);

                        // Opera
                        if ((m = ua.match(/Opera\/([\d.]*)/)) && m[1]) {
                            UA[shell = 'opera'] = numberify(m[1]); // Opera detected, look for revision

                            if ((m = ua.match(/Opera\/.* Version\/([\d.]*)/)) && m[1]) {
                                UA[shell] = numberify(m[1]);
                            }

                            // Opera Mini
                            if ((m = ua.match(/Opera Mini[^;]*/)) && m) {
                                UA.mobile = m[0].toLowerCase(); // ex: Opera Mini/2.0.4509/1316
                            } else if ((m = ua.match(/Opera Mobi[^;]*/)) && m) {
                                // Opera Mobile
                                // ex: Opera/9.80 (Windows NT 6.1; Opera Mobi/49; U; en) Presto/2.4.18 Version/10.00
                                // issue: ���� Opera Mobile �� Version/ �ֶΣ����ܻ��� Opera ����ͬʱ���� Opera Mobile �İ汾��Ҳ�Ƚϻ���
                                UA.mobile = m[0];
                            }
                        }
                        // NOT WebKit or Presto
                    } else {
                        // MSIE
                        // �����ʼ�Ѿ�ʹ���� IE ����ע���жϣ�����䵽�����Ψһ������ֻ�� IE10+
                        // and analysis tools in nodejs
                        if ((ieVersion = getIEVersion(ua))) {
                            UA[shell = 'ie'] = ieVersion;
                            setTridentVersion(ua, UA);
                            // NOT WebKit, Presto or IE
                        } else {
                            // Gecko
                            if ((m = ua.match(/Gecko/))) {
                                UA[core = 'gecko'] = 0.1; // Gecko detected, look for revision
                                if ((m = ua.match(/rv:([\d.]*)/)) && m[1]) {
                                    UA[core] = numberify(m[1]);
                                    if (/Mobile|Tablet/.test(ua)) {
                                        UA.mobile = 'firefox';
                                    }
                                }
                                // Firefox
                                if ((m = ua.match(/Firefox\/([\d.]*)/)) && m[1]) {
                                    UA[shell = 'firefox'] = numberify(m[1]);
                                }
                            }
                        }
                    }
                }
            }

            if (!os) {
                if ((/windows|win32/i).test(ua)) {
                    os = 'windows';
                } else if ((/macintosh|mac_powerpc/i).test(ua)) {
                    os = 'macintosh';
                } else if ((/linux/i).test(ua)) {
                    os = 'linux';
                } else if ((/rhino/i).test(ua)) {
                    os = 'rhino';
                }
            }

            UA.os = os;
            UA.core = UA.core || core;
            UA.shell = shell;
            UA.ieMode = UA.ie && doc.documentMode || UA.ie;

            return UA;
        }

        var UA = getDescriptorFromUserAgent(ua);

// nodejs
        if (typeof process === 'object') {
            var versions, nodeVersion;
            if ((versions = process.versions) && (nodeVersion = versions.node)) {
                UA.os = process.platform;
                UA.nodejs = numberify(nodeVersion);
            }
        }

// use by analysis tools in nodejs
        UA.getDescriptorFromUserAgent = getDescriptorFromUserAgent;
        return UA;
    })();

    // shortcuts
    var toString = Object.prototype.toString,
        isFunction = function (o) {
            return toString.call(o) === '[object Function]';
        },
        isString = function (o) {
            return toString.call(o) === '[object String]';
        },
        isBoolean = function (o) {
            return toString.call(o) === '[object Boolean]';
        },
        isObject = function (o) {
            return toString.call(o) === '[object Object]';
        },
        isNumber = function (o) {
            return toString.call(o) === '[object Number]';
        },
        doc = document,

        mix = function (r, s) {
            for (var p in s) {
                r[p] = s[p];
            }
        },

    // mouse events supported
        mouseEvents = {
            MSPointerOver: 1,
            MSPointerOut: 1,
            MSPointerDown: 1,
            MSPointerUp: 1,
            MSPointerMove: 1,
            // must lower case
            pointerover: 1,
            pointerout: 1,
            pointerdown: 1,
            pointerup: 1,
            pointermove: 1,
            click: 1,
            dblclick: 1,
            mouseover: 1,
            mouseout: 1,
            mouseenter: 1,
            mouseleave: 1,
            mousedown: 1,
            mouseup: 1,
            mousemove: 1
        },

    // key events supported
        keyEvents = {
            keydown: 1,
            keyup: 1,
            keypress: 1
        },

    // HTML events supported
        uiEvents = {
            input: 1,
            submit: 1,
            blur: 1,
            change: 1,
            focus: 1,
            resize: 1,
            scroll: 1,
            select: 1
        },

    //touch events supported
        touchEvents = {
            touchstart: 1,
            touchmove: 1,
            touchend: 1,
            touchcancel: 1
        },

    // events that bubble by default
        bubbleEvents = {
            input: 1,
            scroll: 1,
            resize: 1,
            //reset: 1,
            submit: 1,
            change: 1,
            select: 1
            //error: 1,
            //abort: 1
        };

    // all key and mouse events bubble
    mix(bubbleEvents, mouseEvents);
    mix(bubbleEvents, keyEvents);
    mix(bubbleEvents, touchEvents);

    /*
     * Simulates a key event using the given event information to populate
     * the generated event object. This method does browser-equalizing
     * calculations to account for differences in the DOM and IE event models
     * as well as different browser quirks. Note: keydown causes Safari 2.x to
     * crash.
     * @method simulateKeyEvent
     * @private
     * @static
     * @param {HTMLElement} target The target of the given event.
     * @param {String} type The type of event to fire. This can be any one of
     *      the following: keyup, keydown, and keypress.
     * @param {Boolean} bubbles (Optional) Indicates if the event can be
     *      bubbled up. DOM Level 3 specifies that all key events bubble by
     *      default. The default is true.
     * @param {Boolean} cancelable (Optional) Indicates if the event can be
     *      canceled using preventDefault(). DOM Level 3 specifies that all
     *      key events can be cancelled. The default
     *      is true.
     * @param {Window} view (Optional) The view containing the target. This is
     *      typically the window object. The default is window.
     * @param {Boolean} ctrlKey (Optional) Indicates if one of the CTRL keys
     *      is pressed while the event is firing. The default is false.
     * @param {Boolean} altKey (Optional) Indicates if one of the ALT keys
     *      is pressed while the event is firing. The default is false.
     * @param {Boolean} shiftKey (Optional) Indicates if one of the SHIFT keys
     *      is pressed while the event is firing. The default is false.
     * @param {Boolean} metaKey (Optional) Indicates if one of the META keys
     *      is pressed while the event is firing. The default is false.
     * @param {int} keyCode (Optional) The code for the key that is in use.
     *      The default is 0.
     * @param {int} charCode (Optional) The Unicode code for the character
     *      associated with the key being used. The default is 0.
     */
    function simulateKeyEvent(target /*:HTMLElement*/, type /*:String*/, bubbles /*:Boolean*/, cancelable /*:Boolean*/, view /*:Window*/, ctrlKey /*:Boolean*/, altKey /*:Boolean*/, shiftKey /*:Boolean*/, metaKey /*:Boolean*/, keyCode /*:int*/, charCode /*:int*/) /*:Void*/ {
        // check target
        if (!target) {
            throw "simulateKeyEvent(): Invalid target.";
        }

        // check event type
        if (isString(type)) {
            type = type.toLowerCase();
            switch (type) {
                case "textevent": // DOM Level 3
                    type = "keypress";
                    break;
                case "keyup":
                case "keydown":
                case "keypress":
                    break;
                default:
                    throw "simulateKeyEvent(): Event type '" + type + "' not supported.";
            }
        } else {
            throw "simulateKeyEvent(): Event type must be a string.";
        }

        // setup default values
        if (!isBoolean(bubbles)) {
            bubbles = true; // all key events bubble
        }
        if (!isBoolean(cancelable)) {
            cancelable = true; // all key events can be cancelled
        }
        if (!isObject(view)) {
            view = window; // view is typically window
        }
        if (!isBoolean(ctrlKey)) {
            ctrlKey = false;
        }
        if (!isBoolean(altKey)) {
            altKey = false;
        }
        if (!isBoolean(shiftKey)) {
            shiftKey = false;
        }
        if (!isBoolean(metaKey)) {
            metaKey = false;
        }
        if (!isNumber(keyCode)) {
            keyCode = 0;
        }
        if (!isNumber(charCode)) {
            charCode = 0;
        }

        // try to create a key event
        var customEvent /*:KeyEvent*/ = null;

        if (isFunction(doc.createEvent)) {

            try {

                //try to create key event
                customEvent = doc.createEvent("KeyEvents");

                /*
                 * Interesting problem: Firefox implemented a non-standard
                 * version of initKeyEvent() based on DOM Level 2 specs.
                 * Key event was removed from DOM Level 2 and re-introduced
                 * in DOM Level 3 with a different interface. Firefox is the
                 * only browser with any implementation of Key Events, so for
                 * now, assume it's Firefox if the above line doesn't error.
                 */
                // @TODO: Decipher between Firefox's implementation and a correct one.
                customEvent.initKeyEvent(type, bubbles, cancelable, view, ctrlKey,
                    altKey, shiftKey, metaKey, keyCode, charCode);

            } catch (ex /*:Error*/) {

                /*
                 * If it got here, that means key events aren't officially supported.
                 * Safari/WebKit is a real problem now. WebKit 522 won't let you
                 * set keyCode, charCode, or other properties if you use a
                 * UIEvent, so we first must try to create a generic event. The
                 * fun part is that this will throw an error on Safari 2.x. The
                 * end result is that we need another try...catch statement just to
                 * deal with this mess.
                 */
                try {

                    //try to create generic event - will fail in Safari 2.x
                    customEvent = doc.createEvent("Events");

                } catch (uierror /*:Error*/) {

                    //the above failed, so create a UIEvent for Safari 2.x
                    customEvent = doc.createEvent("UIEvents");

                } finally {

                    customEvent.initEvent(type, bubbles, cancelable);

                    //initialize
                    customEvent.view = view;
                    customEvent.altKey = altKey;
                    customEvent.ctrlKey = ctrlKey;
                    customEvent.shiftKey = shiftKey;
                    customEvent.metaKey = metaKey;
                    customEvent.keyCode = keyCode;
                    customEvent.charCode = charCode;

                }

            }

            //fire the event
            target.dispatchEvent(customEvent);

        } else if (isObject(doc.createEventObject)) { //IE

            // create an IE event object
            customEvent = doc.createEventObject();

            // assign available properties
            customEvent.bubbles = bubbles;
            customEvent.cancelable = cancelable;
            customEvent.view = view;
            customEvent.ctrlKey = ctrlKey;
            customEvent.altKey = altKey;
            customEvent.shiftKey = shiftKey;
            customEvent.metaKey = metaKey;

            /*
             * IE doesn't support charCode explicitly. CharCode should
             * take precedence over any keyCode value for accurate
             * representation.
             */
            customEvent.keyCode = (charCode > 0) ? charCode : keyCode;

            // fire the event
            target.fireEvent("on" + type, customEvent);

        } else {
            throw "simulateKeyEvent(): No event simulation framework present.";
        }
    }

    /*
     * Simulates a mouse event using the given event information to populate
     * the generated event object. This method does browser-equalizing
     * calculations to account for differences in the DOM and IE event models
     * as well as different browser quirks.
     * @method simulateMouseEvent
     * @private
     * @static
     * @param {HTMLElement} target The target of the given event.
     * @param {String} type The type of event to fire. This can be any one of
     *      the following: click, dblclick, mousedown, mouseup, mouseout,
     *      mouseover, and mousemove.
     * @param {Boolean} bubbles (Optional) Indicates if the event can be
     *      bubbled up. DOM Level 2 specifies that all mouse events bubble by
     *      default. The default is true.
     * @param {Boolean} cancelable (Optional) Indicates if the event can be
     *      canceled using preventDefault(). DOM Level 2 specifies that all
     *      mouse events except mousemove can be cancelled. The default
     *      is true for all events except mousemove, for which the default
     *      is false.
     * @param {Window} view (Optional) The view containing the target. This is
     *      typically the window object. The default is window.
     * @param {int} detail (Optional) The number of times the mouse button has
     *      been used. The default value is 1.
     * @param {int} screenX (Optional) The x-coordinate on the screen at which
     *      point the event occurred. The default is 0.
     * @param {int} screenY (Optional) The y-coordinate on the screen at which
     *      point the event occurred. The default is 0.
     * @param {int} clientX (Optional) The x-coordinate on the client at which
     *      point the event occurred. The default is 0.
     * @param {int} clientY (Optional) The y-coordinate on the client at which
     *      point the event occurred. The default is 0.
     * @param {Boolean} ctrlKey (Optional) Indicates if one of the CTRL keys
     *      is pressed while the event is firing. The default is false.
     * @param {Boolean} altKey (Optional) Indicates if one of the ALT keys
     *      is pressed while the event is firing. The default is false.
     * @param {Boolean} shiftKey (Optional) Indicates if one of the SHIFT keys
     *      is pressed while the event is firing. The default is false.
     * @param {Boolean} metaKey (Optional) Indicates if one of the META keys
     *      is pressed while the event is firing. The default is false.
     * @param {int} button (Optional) The button being pressed while the event
     *      is executing. The value should be 0 for the primary mouse button
     *      (typically the left button), 1 for the terciary mouse button
     *      (typically the middle button), and 2 for the secondary mouse button
     *      (typically the right button). The default is 0.
     * @param {HTMLElement} relatedTarget (Optional) For mouseout events,
     *      this is the element that the mouse has moved to. For mouseover
     *      events, this is the element that the mouse has moved from. This
     *      argument is ignored for all other events. The default is null.
     */
    function simulateMouseEvent(target /*:HTMLElement*/, type /*:String*/, bubbles /*:Boolean*/, cancelable /*:Boolean*/, view /*:Window*/, detail /*:int*/, screenX /*:int*/, screenY /*:int*/, clientX /*:int*/, clientY /*:int*/, ctrlKey /*:Boolean*/, altKey /*:Boolean*/, shiftKey /*:Boolean*/, metaKey /*:Boolean*/, button /*:int*/, relatedTarget /*:HTMLElement*/) /*:Void*/ {
        // check target
        if (!target) {
            throw "simulateMouseEvent(): Invalid target.";
        }

        // check event type
        if (isString(type)) {
            // make sure it's a supported mouse event
            if (!mouseEvents[type]) {
                throw "simulateMouseEvent(): Event type '" + type + "' not supported.";
            }
        } else {
            throw "simulateMouseEvent(): Event type must be a string.";
        }

        // setup default values
        if (!isBoolean(bubbles)) {
            bubbles = true; // all mouse events bubble
        }
        if (!isBoolean(cancelable)) {
            cancelable = (type !== "mousemove"); // mousemove is the only one that can't be cancelled
        }
        if (!isObject(view)) {
            view = window; // view is typically window
        }
        if (!isNumber(detail)) {
            detail = 1;  // number of mouse clicks must be at least one
        }
        if (!isNumber(screenX)) {
            screenX = 0;
        }
        if (!isNumber(screenY)) {
            screenY = 0;
        }
        if (!isNumber(clientX)) {
            clientX = 0;
        }
        if (!isNumber(clientY)) {
            clientY = 0;
        }
        if (!isBoolean(ctrlKey)) {
            ctrlKey = false;
        }
        if (!isBoolean(altKey)) {
            altKey = false;
        }
        if (!isBoolean(shiftKey)) {
            shiftKey = false;
        }
        if (!isBoolean(metaKey)) {
            metaKey = false;
        }
        if (!isNumber(button)) {
            button = 0;
        }

        relatedTarget = relatedTarget || null;

        // try to create a mouse event
        var customEvent /*:MouseEvent*/ = null;

        if (isFunction(doc.createEvent)) {

            customEvent = doc.createEvent("MouseEvent");

            customEvent.initMouseEvent(type, bubbles, cancelable, view, detail,
                screenX, screenY, clientX, clientY,
                ctrlKey, altKey, shiftKey, metaKey,
                button, relatedTarget);

            /*
             * Check to see if relatedTarget has been assigned. Firefox
             * versions less than 2.0 don't allow it to be assigned via
             * initMouseEvent() and the property is readonly after event
             * creation, so in order to .relatedTarget
             * working, assign to the IE proprietary toElement property
             * for mouseout event and fromElement property for mouseover
             * event.
             */
            if (relatedTarget && !customEvent.relatedTarget) {
                if (type === "mouseout") {
                    customEvent.toElement = relatedTarget;
                } else if (type === "mouseover") {
                    customEvent.fromElement = relatedTarget;
                }
            }

            // fire the event
            target.dispatchEvent(customEvent);
        } else if (doc.createEventObject) { // IE

            // create an IE event object
            customEvent = doc.createEventObject();

            // assign available properties
            customEvent.bubbles = bubbles;
            customEvent.cancelable = cancelable;
            customEvent.view = view;
            customEvent.detail = detail;
            customEvent.screenX = screenX;
            customEvent.screenY = screenY;
            customEvent.clientX = clientX;
            customEvent.clientY = clientY;
            customEvent.ctrlKey = ctrlKey;
            customEvent.altKey = altKey;
            customEvent.metaKey = metaKey;
            customEvent.shiftKey = shiftKey;

            // fix button property for IE's wacky implementation
            switch (button) {
                case 0:
                    customEvent.button = 1;
                    break;
                case 1:
                    customEvent.button = 4;
                    break;
                case 2:
                    //leave as is
                    break;
                default:
                    customEvent.button = 0;
            }

            /*
             * Have to use relatedTarget because IE won't allow assignment
             * to toElement or fromElement on generic events. This keeps
             * .relatedTarget functional.
             */
            customEvent.relatedTarget = relatedTarget;

            // fire the event
            target.fireEvent("on" + type, customEvent);

        } else {
            throw "simulateMouseEvent(): No event simulation framework present.";
        }
    }

    /*
     * Simulates a UI event using the given event information to populate
     * the generated event object. This method does browser-equalizing
     * calculations to account for differences in the DOM and IE event models
     * as well as different browser quirks.
     * @method simulateHTMLEvent
     * @private
     * @static
     * @param {HTMLElement} target The target of the given event.
     * @param {String} type The type of event to fire. This can be any one of
     *      the following: click, dblclick, mousedown, mouseup, mouseout,
     *      mouseover, and mousemove.
     * @param {Boolean} bubbles (Optional) Indicates if the event can be
     *      bubbled up. DOM Level 2 specifies that all mouse events bubble by
     *      default. The default is true.
     * @param {Boolean} cancelable (Optional) Indicates if the event can be
     *      canceled using preventDefault(). DOM Level 2 specifies that all
     *      mouse events except mousemove can be cancelled. The default
     *      is true for all events except mousemove, for which the default
     *      is false.
     * @param {Window} view (Optional) The view containing the target. This is
     *      typically the window object. The default is window.
     * @param {int} detail (Optional) The number of times the mouse button has
     *      been used. The default value is 1.
     */
    function simulateUIEvent(target /*:HTMLElement*/, type /*:String*/, bubbles /*:Boolean*/, cancelable /*:Boolean*/, view /*:Window*/, detail /*:int*/) /*:Void*/ {

        // check target
        if (!target) {
            throw "simulateUIEvent(): Invalid target.";
        }

        // check event type
        if (isString(type)) {
            type = type.toLowerCase();

            // make sure it's a supported mouse event
            if (!uiEvents[type]) {
                throw "simulateUIEvent(): Event type '" + type + "' not supported.";
            }
        } else {
            throw "simulateUIEvent(): Event type must be a string.";
        }

        // try to create a mouse event
        var customEvent = null;


        // setup default values
        if (!isBoolean(bubbles)) {
            bubbles = (type in bubbleEvents);  // not all events bubble
        }
        if (!isBoolean(cancelable)) {
            cancelable = (type === "submit"); // submit is the only one that can be cancelled
        }
        if (!isObject(view)) {
            view = window; // view is typically window
        }
        if (!isNumber(detail)) {
            detail = 1;  // usually not used but defaulted to this
        }

        if (isFunction(doc.createEvent)) {

            // just a generic UI Event object is needed
            customEvent = doc.createEvent("UIEvent");
            customEvent.initUIEvent(type, bubbles, cancelable, view, detail);

            // fire the event
            target.dispatchEvent(customEvent);

        } else if (isObject(doc.createEventObject)) { // IE

            // create an IE event object
            customEvent = doc.createEventObject();

            // assign available properties
            customEvent.bubbles = bubbles;
            customEvent.cancelable = cancelable;
            customEvent.view = view;
            customEvent.detail = detail;

            // fire the event
            target.fireEvent("on" + type, customEvent);

        } else {
            throw "simulateUIEvent(): No event simulation framework present.";
        }
    }


    /*
     * @method simulateTouchEvent
     * @private
     * @param {HTMLElement} target The target of the given event.
     * @param {String} type The type of event to fire. This can be any one of
     *      the following: touchstart, touchmove, touchend, touchcancel.
     * @param {Boolean} bubbles (Optional) Indicates if the event can be
     *      bubbled up. DOM Level 2 specifies that all mouse events bubble by
     *      default. The default is true.
     * @param {Boolean} cancelable (Optional) Indicates if the event can be
     *      canceled using preventDefault(). DOM Level 2 specifies that all
     *      touch events except touchcancel can be cancelled. The default
     *      is true for all events except touchcancel, for which the default
     *      is false.
     * @param {Window} view (Optional) The view containing the target. This is
     *      typically the window object. The default is window.
     * @param {int} detail (Optional) Specifies some detail information about
     *      the event depending on the type of event.
     * @param {int} screenX (Optional) The x-coordinate on the screen at which
     *      point the event occured. The default is 0.
     * @param {int} screenY (Optional) The y-coordinate on the screen at which
     *      point the event occured. The default is 0.
     * @param {int} clientX (Optional) The x-coordinate on the client at which
     *      point the event occured. The default is 0.
     * @param {int} clientY (Optional) The y-coordinate on the client at which
     *      point the event occured. The default is 0.
     * @param {Boolean} ctrlKey (Optional) Indicates if one of the CTRL keys
     *      is pressed while the event is firing. The default is false.
     * @param {Boolean} altKey (Optional) Indicates if one of the ALT keys
     *      is pressed while the event is firing. The default is false.
     * @param {Boolean} shiftKey (Optional) Indicates if one of the SHIFT keys
     *      is pressed while the event is firing. The default is false.
     * @param {Boolean} metaKey (Optional) Indicates if one of the META keys
     *      is pressed while the event is firing. The default is false.
     * @param {TouchList} touches A collection of Touch objects representing
     *      all touches associated with this event.
     * @param {TouchList} targetTouches A collection of Touch objects
     *      representing all touches associated with this target.
     * @param {TouchList} changedTouches A collection of Touch objects
     *      representing all touches that changed in this event.
     * @param {float} scale (iOS v2+ only) The distance between two fingers
     *      since the start of an event as a multiplier of the initial distance.
     *      The default value is 1.0.
     * @param {float} rotation (iOS v2+ only) The delta rotation since the start
     *      of an event, in degrees, where clockwise is positive and
     *      counter-clockwise is negative. The default value is 0.0.
     */
    function simulateTouchEvent(target, type, bubbles,            // boolean
                                cancelable,         // boolean
                                view,               // DOMWindow
                                detail,             // long
                                screenX, screenY,   // long
                                clientX, clientY,   // long
                                ctrlKey, altKey, shiftKey, metaKey, // boolean
                                touches,            // TouchList
                                targetTouches,      // TouchList
                                changedTouches,     // TouchList
                                scale,              // float
                                rotation            // float
    ) {

        if (touches) {
            touches = createTouchList(target, touches);
        }

        if (changedTouches) {
            changedTouches = createTouchList(target, changedTouches);
        }

        if (targetTouches) {
            targetTouches = createTouchList(target, targetTouches);
        }

        var customEvent;

        // check target
        if (!target) {
            throw new Error("simulateTouchEvent(): Invalid target.");
        }

        //check event type
        if (typeof type === 'string') {
            type = type.toLowerCase();

            //make sure it's a supported touch event
            if (!touchEvents[type]) {
                throw new Error("simulateTouchEvent(): Event type '" + type + "' not supported.");
            }
        } else {
            throw new Error("simulateTouchEvent(): Event type must be a string.");
        }

        if (type === 'touchstart' || type === 'touchmove') {
            if (touches.length === 0) {
                throw new Error('simulateTouchEvent(): No touch object in touches');
            }
        } else if (type === 'touchend') {
            if (changedTouches.length === 0) {
                throw new Error('simulateTouchEvent(): No touch object in changedTouches');
            }
        }

        // setup default values
        if (!isBoolean(bubbles)) {
            bubbles = true;
        } // bubble by default.
        if (!isBoolean(cancelable)) {
            cancelable = (type !== "touchcancel"); // touchcancel is not cancelled
        }
        if (!isObject(view)) {
            view = window;
        }
        if (!isNumber(detail)) {
            detail = 1;
        } // usually not used. defaulted to # of touch objects.
        if (!isNumber(screenX)) {
            screenX = 0;
        }
        if (!isNumber(screenY)) {
            screenY = 0;
        }
        if (!isNumber(clientX)) {
            clientX = 0;
        }
        if (!isNumber(clientY)) {
            clientY = 0;
        }
        if (!isBoolean(ctrlKey)) {
            ctrlKey = false;
        }
        if (!isBoolean(altKey)) {
            altKey = false;
        }
        if (!isBoolean(shiftKey)) {
            shiftKey = false;
        }
        if (!isBoolean(metaKey)) {
            metaKey = false;
        }
        if (!isNumber(scale)) {
            scale = 1.0;
        }
        if (!isNumber(rotation)) {
            rotation = 0.0;
        }


        //check for DOM-compliant browsers first
        if (isFunction(document.createEvent)) {
            if (UA.android || UA.chrome) {
                /**
                 * Couldn't find android start version that supports touch event.
                 * Assumed supported(btw APIs broken till icecream sandwitch)
                 * from the beginning.
                 */
                if (UA.android < 4.0 ||
                        // emulate touch events
                    UA.chrome) {
                    /**
                     * Touch APIs are broken in androids older than 4.0.
                     * We will use
                     * simulated touch apis for these versions.
                     * App developer still can listen for touch events.
                     * This events
                     * will be dispatched with touch event types.
                     *
                     * (Note) Used target for the relatedTarget.
                     * Need to verify if
                     * it has a side effect.
                     */
                    customEvent = document.createEvent("MouseEvent");
                    customEvent.initMouseEvent(type, bubbles, cancelable, view, detail,
                        screenX, screenY, clientX, clientY,
                        ctrlKey, altKey, shiftKey, metaKey,
                        0, target);

                    customEvent.touches = touches;
                    customEvent.targetTouches = targetTouches;
                    customEvent.changedTouches = changedTouches;
                } else {
                    customEvent = document.createEvent("TouchEvent");

                    // Andoroid isn't compliant W3C initTouchEvent method signature.
                    customEvent.initTouchEvent(touches, targetTouches, changedTouches,
                        type, view,
                        screenX, screenY, clientX, clientY,
                        ctrlKey, altKey, shiftKey, metaKey);
                }
            } else if (UA.ios) {
                if (UA.ios >= 2.0) {
                    customEvent = document.createEvent("TouchEvent");

                    // Available iOS 2.0 and later
                    customEvent.initTouchEvent(type, bubbles, cancelable, view, detail,
                        screenX, screenY, clientX, clientY,
                        ctrlKey, altKey, shiftKey, metaKey,
                        touches, targetTouches, changedTouches,
                        scale, rotation);
                } else {
                    throw new Error('simulateTouchEvent(): No touch event simulation framework present for iOS, ' + UA.ios + '.');
                }
            } else {
                throw new Error('simulateTouchEvent(): Not supported agent yet, ' + navigator.userAgent);
            }

            //fire the event
            target.dispatchEvent(customEvent);
        } else {
            throw new Error('simulateTouchEvent(): No event simulation framework present.');
        }
    }


    // http://developer.apple.com/library/safari/#documentation/UserExperience/Reference/DocumentAdditionsReference/DocumentAdditions/DocumentAdditions.html
    /**
     * Helper method to convert an array with touch points to TouchList object as
     * defined in http://www.w3.org/TR/touch-events/
     * @param {Array} touchPoints
     * @return {TouchList | Array} If underlying platform support creating touch list
     *      a TouchList object will be returned otherwise a fake Array object
     *      will be returned.
     */
    function createTouchList(target, touchPoints) {
        /*
         * Android 4.0.3 emulator:
         * Native touch api supported starting in version 4.0 (Ice Cream Sandwich).
         * However the support seems limited. In Android 4.0.3 emulator, I got
         * "TouchList is not defined".
         */
        var touches = [],
            touchList;

        if (!!touchPoints && Array.isArray(touchPoints)) {
            if (UA.android && UA.android >= 4.0 || UA.ios && UA.ios >= 2.0) {
                touchPoints.forEach(function (point) {
                    if (!point.identifier) {
                        point.identifier = 0;
                    }
                    if (!point.pageX) {
                        point.pageX = 0;
                    }
                    if (!point.pageX && point.clientX) {
                        point.pageX = point.clientX + window.pageXOffset;
                    }
                    if (!point.pageY) {
                        point.pageY = 0;
                    }
                    if (!point.pageY && point.clientY) {
                        point.pageY = point.clientY + window.pageYOffset;
                    }
                    if (!point.screenX) {
                        point.screenX = 0;
                    }
                    if (!point.screenY) {
                        point.screenY = 0;
                    }

                    touches.push(document.createTouch(window,
                        point.target || target,
                        point.identifier,
                        point.pageX, point.pageY,
                        point.screenX, point.screenY));
                });

                touchList = document.createTouchList.apply(document, touches);
            } else if (UA.ios && UA.ios < 2.0) {
                throw new Error(': No touch event simulation framework present.');
            } else {
                // this will include android(UA.android && UA.android < 4.0)
                // and desktops among all others.

                /**
                 * Touch APIs are broken in androids older than 4.0. We will use
                 * simulated touch apis for these versions.
                 */
                touchList = [];
                touchPoints.forEach(function (point) {
                    if (!point.identifier) {
                        point.identifier = 0;
                    }
                    if (!point.clientX) {
                        point.clientX = 0;
                    }
                    if (!point.clientY) {
                        point.clientY = 0;
                    }
                    if (!point.pageX) {
                        point.pageX = 0;
                    }
                    if (!point.pageX && point.clientX) {
                        point.pageX = point.clientX + window.pageXOffset;
                    }
                    if (!point.pageY) {
                        point.pageY = 0;
                    }
                    if (!point.pageY && point.clientY) {
                        point.pageY = point.clientY + window.pageYOffset;
                    }
                    if (!point.screenX) {
                        point.screenX = 0;
                    }
                    if (!point.screenY) {
                        point.screenY = 0;
                    }

                    touchList.push({
                        target: point.target || target,
                        identifier: point.identifier,
                        clientX: point.clientX,
                        clientY: point.clientY,
                        pageX: point.pageX,
                        pageY: point.pageY,
                        screenX: point.screenX,
                        screenY: point.screenY
                    });
                });

                touchList.item = function (i) {
                    return touchList[i];
                };
            }
        } else {
            throw new Error('Invalid touchPoints passed');
        }

        return touchList;
    }

    function simulateDeviceMotionEvent(target, option) {
        if (document.createEvent && window.DeviceMotionEvent) {
            var customEvent = document.createEvent('DeviceMotionEvent');

            customEvent.initDeviceMotionEvent('devicemotion',
                false, false,
                option.acceleration,
                option.accelerationIncludingGravity || option.acceleration,
                option.rotationRate || {
                    alpha: 0,
                    beta: 0,
                    gamma: 0
                }, option.interval || 100);

            window.dispatchEvent(customEvent);
        }
    }


    /**
     * Simulates the event with the given name on a target.
     * @param {HTMLElement} target The DOM element that's the target of the event.
     * @param {String} type The type of event to simulate (i.e., "click").
     * @param {Object} options (Optional) Extra options to copy onto the event object.
     * @return {void}
     * @for Event
     * @method simulate
     * @static
     */
    var simulateEvent = function (target, type, options) {
        if (UA.ie && UA.ieMode < 10 && type === 'input') {
            return;
        }
        options = options || {};
        if (type === 'click') {
            simulateEvent(target, 'mousedown', options);
            simulateEvent(target, 'mouseup', options);
        }
        if (!UA.phantomjs) {
            if (isPointerSupported) {
                if (type === 'mousedown') {
                    simulateEvent(target, 'pointerdown', options);
                } else if (type === 'mouseup') {
                    simulateEvent(target, 'pointerup', options);
                } else if (type === 'mousemove') {
                    simulateEvent(target, 'pointermove', options);
                }
            } else if (isMsPointerSupported) {
                if (type === 'mousedown') {
                    simulateEvent(target, 'MSPointerDown', options);
                } else if (type === 'mouseup') {
                    simulateEvent(target, 'MSPointerUp', options);
                } else if (type === 'mousemove') {
                    simulateEvent(target, 'MSPointerMove', options);
                }
            } else if ("ontouchstart" in window) {
                var obj = {
                    touches: [options],
                    changedTouches: [options]
                };
                if (type === 'mousedown') {
                    simulateEvent(target, 'touchstart', obj);
                } else if (type === 'mouseup') {
                    simulateEvent(target, 'touchend', obj);
                } else if (type === 'mousemove') {
                    simulateEvent(target, 'touchmove', obj);
                }
            }
        }
        if (mouseEvents[type]) {
            simulateMouseEvent(target, type, options.bubbles,
                options.cancelable, options.view, options.detail, options.screenX,
                options.screenY, options.clientX, options.clientY, options.ctrlKey,
                options.altKey, options.shiftKey, options.metaKey, options.button,
                options.relatedTarget);
        } else if (keyEvents[type]) {
            simulateKeyEvent(target, type, options.bubbles,
                options.cancelable, options.view, options.ctrlKey,
                options.altKey, options.shiftKey, options.metaKey,
                options.keyCode, options.charCode);
        } else if (uiEvents[type]) {
            simulateUIEvent(target, type, options.bubbles,
                options.cancelable, options.view, options.detail);
        } else if (touchEvents[type]) {
            if ((window && ("ontouchstart" in window)) && !(UA.phantomjs) && !(UA.chrome && UA.chrome < 6)) {
                simulateTouchEvent(target, type,
                    options.bubbles, options.cancelable, options.view, options.detail,
                    options.screenX, options.screenY, options.clientX, options.clientY,
                    options.ctrlKey, options.altKey, options.shiftKey, options.metaKey,
                    options.touches, options.targetTouches, options.changedTouches,
                    options.scale, options.rotation);
            } else {
                throw new Error("simulate(): Event '" + type + "' can't be simulated.");
            }
        } else if (type === 'devicemotion') {
            simulateDeviceMotionEvent(target, options);
        } else {
            throw "simulate(): Event '" + type + "' can't be simulated.";
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = simulateEvent;
    } else {
        window.simulateEvent = simulateEvent;
    }
})();

/**
 * 2012-12-12 yiminghe@gmail.com
 *  - simplify from yui3
 *  - we only support latest browsers
 *  - normalize drag
 */

}).call(this,_dereq_("c:\\Users\\coding\\Documents\\GitHub\\browser\\node_modules\\browserify\\node_modules\\process\\browser.js"))
},{"c:\\Users\\coding\\Documents\\GitHub\\browser\\node_modules\\browserify\\node_modules\\process\\browser.js":2}],5:[function(_dereq_,module,exports){
/*jslint nomen: true*/
/*global module */

var defaultCheckIntervalInMs = 100;

function executeFn(fn) {
    return typeof(fn) === "string" ? eval(fn) : fn();
}

/**
 * This is a modification of waitfor.js from https://github.com/ariya/phantomjs/blob/master/examples/waitfor.js
 * Wait until the test condition is true or a timeout occurs. Useful for waiting
 * on a server response or for a ui change (fadeIn, etc.) to occur.
 * @param {Object} options options of the method.
 * @param {Function} options.testFn javascript condition that evaluates to a boolean,
 * it can be passed in as a string (e.g.: "1 == 1" or "$('#bar').is(':visible')" or
 * as a callback function.
 * @param {Function} options.onReady what to do when testFn condition is fulfilled,
 * it can be passed in as a string (e.g.: "1 == 1" or "$('#bar').is(':visible')" or
 * as a callback function.
 * @param {Function} options.onTimeout what to do when testFn condition is not fulfilled and timeout occurs.
 * @param {Number} options.timeoutMs the max amount of time to wait. If not specified, 3 sec is used.
 */
module.exports.for = function (options) {
    var maxTimeoutMs = options.timeoutMs || 3000, // Default Max Timeout is 3s
        start = new Date().getTime(),
        interval = setInterval(function () {
            try {
                if (executeFn(options.testFn)) {      // The condition is met
                    clearInterval(interval);  // Stop the interval
                    executeFn(options.onReady);
                    return;
                }

                if (new Date().getTime() - start > maxTimeoutMs) { // It timeouts
                    clearInterval(interval);
                    executeFn(options.onTimeout);
                }
            }
            catch (e) {
                clearInterval(interval);
                throw e;
            }
        }, defaultCheckIntervalInMs); // repeat check
};
},{}],6:[function(_dereq_,module,exports){
/*jslint nomen: true*/
/*global module,require */

var Q = _dereq_("q");
var wait = _dereq_('wait-js');
var simulate = _dereq_('./simulate');
var domQuery = _dereq_('./dom-query');
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
},{"./dom-query":8,"./simulate":9,"q":3,"wait-js":5}],7:[function(_dereq_,module,exports){
/*jslint nomen: true*/
/*global module,require */

var Q = _dereq_("q");
var Automation = _dereq_('./automation');
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
},{"./automation":6,"q":3}],8:[function(_dereq_,module,exports){
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
},{}],9:[function(_dereq_,module,exports){
/*jslint nomen: true*/
/*global module,require */

var simulateEvent = _dereq_('simulate-dom-event');

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
},{"simulate-dom-event":4}]},{},[1])
(1)
});