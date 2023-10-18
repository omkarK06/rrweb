
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var rrwebPlayer = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        if (value == null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
     * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
     * it can be called from an external module).
     *
     * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
     *
     * https://svelte.dev/docs#run-time-svelte-onmount
     */
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    /**
     * Schedules a callback to run immediately after the component has been updated.
     *
     * The first time the callback runs will be after the initial `onMount`
     */
    function afterUpdate(fn) {
        get_current_component().$$.after_update.push(fn);
    }
    /**
     * Schedules a callback to run immediately before the component is unmounted.
     *
     * Out of `onMount`, `beforeUpdate`, `afterUpdate` and `onDestroy`, this is the
     * only one that runs inside a server-side component.
     *
     * https://svelte.dev/docs#run-time-svelte-ondestroy
     */
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    /**
     * Creates an event dispatcher that can be used to dispatch [component events](/docs#template-syntax-component-directives-on-eventname).
     * Event dispatchers are functions that can take two arguments: `name` and `detail`.
     *
     * Component events created with `createEventDispatcher` create a
     * [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
     * These events do not [bubble](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#Event_bubbling_and_capture).
     * The `detail` argument corresponds to the [CustomEvent.detail](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail)
     * property and can contain any type of data.
     *
     * https://svelte.dev/docs#run-time-svelte-createeventdispatcher
     */
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail, { cancelable = false } = {}) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail, { cancelable });
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
                return !event.defaultPrevented;
            }
            return true;
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.59.2' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation, has_stop_immediate_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        if (has_stop_immediate_propagation)
            modifiers.push('stopImmediatePropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    var NodeType$2;
    (function (NodeType) {
        NodeType[NodeType["Document"] = 0] = "Document";
        NodeType[NodeType["DocumentType"] = 1] = "DocumentType";
        NodeType[NodeType["Element"] = 2] = "Element";
        NodeType[NodeType["Text"] = 3] = "Text";
        NodeType[NodeType["CDATA"] = 4] = "CDATA";
        NodeType[NodeType["Comment"] = 5] = "Comment";
    })(NodeType$2 || (NodeType$2 = {}));

    function isElement(n) {
        return n.nodeType === n.ELEMENT_NODE;
    }
    var Mirror$2 = (function () {
        function Mirror() {
            this.idNodeMap = new Map();
            this.nodeMetaMap = new WeakMap();
        }
        Mirror.prototype.getId = function (n) {
            var _a;
            if (!n)
                return -1;
            var id = (_a = this.getMeta(n)) === null || _a === void 0 ? void 0 : _a.id;
            return id !== null && id !== void 0 ? id : -1;
        };
        Mirror.prototype.getNode = function (id) {
            return this.idNodeMap.get(id) || null;
        };
        Mirror.prototype.getIds = function () {
            return Array.from(this.idNodeMap.keys());
        };
        Mirror.prototype.getMeta = function (n) {
            return this.nodeMetaMap.get(n) || null;
        };
        Mirror.prototype.removeNodeFromMap = function (n) {
            var _this = this;
            var id = this.getId(n);
            this.idNodeMap["delete"](id);
            if (n.childNodes) {
                n.childNodes.forEach(function (childNode) {
                    return _this.removeNodeFromMap(childNode);
                });
            }
        };
        Mirror.prototype.has = function (id) {
            return this.idNodeMap.has(id);
        };
        Mirror.prototype.hasNode = function (node) {
            return this.nodeMetaMap.has(node);
        };
        Mirror.prototype.add = function (n, meta) {
            var id = meta.id;
            this.idNodeMap.set(id, n);
            this.nodeMetaMap.set(n, meta);
        };
        Mirror.prototype.replace = function (id, n) {
            var oldNode = this.getNode(id);
            if (oldNode) {
                var meta = this.nodeMetaMap.get(oldNode);
                if (meta)
                    this.nodeMetaMap.set(n, meta);
            }
            this.idNodeMap.set(id, n);
        };
        Mirror.prototype.reset = function () {
            this.idNodeMap = new Map();
            this.nodeMetaMap = new WeakMap();
        };
        return Mirror;
    }());
    function createMirror$2() {
        return new Mirror$2();
    }
    function toLowerCase(str) {
        return str.toLowerCase();
    }
    function isNodeMetaEqual(a, b) {
        if (!a || !b || a.type !== b.type)
            return false;
        if (a.type === NodeType$2.Document)
            return a.compatMode === b.compatMode;
        else if (a.type === NodeType$2.DocumentType)
            return (a.name === b.name &&
                a.publicId === b.publicId &&
                a.systemId === b.systemId);
        else if (a.type === NodeType$2.Comment ||
            a.type === NodeType$2.Text ||
            a.type === NodeType$2.CDATA)
            return a.textContent === b.textContent;
        else if (a.type === NodeType$2.Element)
            return (a.tagName === b.tagName &&
                JSON.stringify(a.attributes) ===
                    JSON.stringify(b.attributes) &&
                a.isSVG === b.isSVG &&
                a.needBlock === b.needBlock);
        return false;
    }

    var commentre = /\/\*[^*]*\*+([^/*][^*]*\*+)*\//g;
    function parse(css, options) {
        if (options === void 0) { options = {}; }
        var lineno = 1;
        var column = 1;
        function updatePosition(str) {
            var lines = str.match(/\n/g);
            if (lines) {
                lineno += lines.length;
            }
            var i = str.lastIndexOf('\n');
            column = i === -1 ? column + str.length : str.length - i;
        }
        function position() {
            var start = { line: lineno, column: column };
            return function (node) {
                node.position = new Position(start);
                whitespace();
                return node;
            };
        }
        var Position = (function () {
            function Position(start) {
                this.start = start;
                this.end = { line: lineno, column: column };
                this.source = options.source;
            }
            return Position;
        }());
        Position.prototype.content = css;
        var errorsList = [];
        function error(msg) {
            var err = new Error("".concat(options.source || '', ":").concat(lineno, ":").concat(column, ": ").concat(msg));
            err.reason = msg;
            err.filename = options.source;
            err.line = lineno;
            err.column = column;
            err.source = css;
            if (options.silent) {
                errorsList.push(err);
            }
            else {
                throw err;
            }
        }
        function stylesheet() {
            var rulesList = rules();
            return {
                type: 'stylesheet',
                stylesheet: {
                    source: options.source,
                    rules: rulesList,
                    parsingErrors: errorsList
                }
            };
        }
        function open() {
            return match(/^{\s*/);
        }
        function close() {
            return match(/^}/);
        }
        function rules() {
            var node;
            var rules = [];
            whitespace();
            comments(rules);
            while (css.length && css.charAt(0) !== '}' && (node = atrule() || rule())) {
                if (node) {
                    rules.push(node);
                    comments(rules);
                }
            }
            return rules;
        }
        function match(re) {
            var m = re.exec(css);
            if (!m) {
                return;
            }
            var str = m[0];
            updatePosition(str);
            css = css.slice(str.length);
            return m;
        }
        function whitespace() {
            match(/^\s*/);
        }
        function comments(rules) {
            if (rules === void 0) { rules = []; }
            var c;
            while ((c = comment())) {
                if (c) {
                    rules.push(c);
                }
                c = comment();
            }
            return rules;
        }
        function comment() {
            var pos = position();
            if ('/' !== css.charAt(0) || '*' !== css.charAt(1)) {
                return;
            }
            var i = 2;
            while ('' !== css.charAt(i) &&
                ('*' !== css.charAt(i) || '/' !== css.charAt(i + 1))) {
                ++i;
            }
            i += 2;
            if ('' === css.charAt(i - 1)) {
                return error('End of comment missing');
            }
            var str = css.slice(2, i - 2);
            column += 2;
            updatePosition(str);
            css = css.slice(i);
            column += 2;
            return pos({
                type: 'comment',
                comment: str
            });
        }
        function selector() {
            var m = match(/^([^{]+)/);
            if (!m) {
                return;
            }
            return trim(m[0])
                .replace(/\/\*([^*]|[\r\n]|(\*+([^*/]|[\r\n])))*\*\/+/g, '')
                .replace(/"(?:\\"|[^"])*"|'(?:\\'|[^'])*'/g, function (m) {
                return m.replace(/,/g, '\u200C');
            })
                .split(/\s*(?![^(]*\)),\s*/)
                .map(function (s) {
                return s.replace(/\u200C/g, ',');
            });
        }
        function declaration() {
            var pos = position();
            var propMatch = match(/^(\*?[-#\/\*\\\w]+(\[[0-9a-z_-]+\])?)\s*/);
            if (!propMatch) {
                return;
            }
            var prop = trim(propMatch[0]);
            if (!match(/^:\s*/)) {
                return error("property missing ':'");
            }
            var val = match(/^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^\)]*?\)|[^};])+)/);
            var ret = pos({
                type: 'declaration',
                property: prop.replace(commentre, ''),
                value: val ? trim(val[0]).replace(commentre, '') : ''
            });
            match(/^[;\s]*/);
            return ret;
        }
        function declarations() {
            var decls = [];
            if (!open()) {
                return error("missing '{'");
            }
            comments(decls);
            var decl;
            while ((decl = declaration())) {
                if (decl !== false) {
                    decls.push(decl);
                    comments(decls);
                }
                decl = declaration();
            }
            if (!close()) {
                return error("missing '}'");
            }
            return decls;
        }
        function keyframe() {
            var m;
            var vals = [];
            var pos = position();
            while ((m = match(/^((\d+\.\d+|\.\d+|\d+)%?|[a-z]+)\s*/))) {
                vals.push(m[1]);
                match(/^,\s*/);
            }
            if (!vals.length) {
                return;
            }
            return pos({
                type: 'keyframe',
                values: vals,
                declarations: declarations()
            });
        }
        function atkeyframes() {
            var pos = position();
            var m = match(/^@([-\w]+)?keyframes\s*/);
            if (!m) {
                return;
            }
            var vendor = m[1];
            m = match(/^([-\w]+)\s*/);
            if (!m) {
                return error('@keyframes missing name');
            }
            var name = m[1];
            if (!open()) {
                return error("@keyframes missing '{'");
            }
            var frame;
            var frames = comments();
            while ((frame = keyframe())) {
                frames.push(frame);
                frames = frames.concat(comments());
            }
            if (!close()) {
                return error("@keyframes missing '}'");
            }
            return pos({
                type: 'keyframes',
                name: name,
                vendor: vendor,
                keyframes: frames
            });
        }
        function atsupports() {
            var pos = position();
            var m = match(/^@supports *([^{]+)/);
            if (!m) {
                return;
            }
            var supports = trim(m[1]);
            if (!open()) {
                return error("@supports missing '{'");
            }
            var style = comments().concat(rules());
            if (!close()) {
                return error("@supports missing '}'");
            }
            return pos({
                type: 'supports',
                supports: supports,
                rules: style
            });
        }
        function athost() {
            var pos = position();
            var m = match(/^@host\s*/);
            if (!m) {
                return;
            }
            if (!open()) {
                return error("@host missing '{'");
            }
            var style = comments().concat(rules());
            if (!close()) {
                return error("@host missing '}'");
            }
            return pos({
                type: 'host',
                rules: style
            });
        }
        function atmedia() {
            var pos = position();
            var m = match(/^@media *([^{]+)/);
            if (!m) {
                return;
            }
            var media = trim(m[1]);
            if (!open()) {
                return error("@media missing '{'");
            }
            var style = comments().concat(rules());
            if (!close()) {
                return error("@media missing '}'");
            }
            return pos({
                type: 'media',
                media: media,
                rules: style
            });
        }
        function atcustommedia() {
            var pos = position();
            var m = match(/^@custom-media\s+(--[^\s]+)\s*([^{;]+);/);
            if (!m) {
                return;
            }
            return pos({
                type: 'custom-media',
                name: trim(m[1]),
                media: trim(m[2])
            });
        }
        function atpage() {
            var pos = position();
            var m = match(/^@page */);
            if (!m) {
                return;
            }
            var sel = selector() || [];
            if (!open()) {
                return error("@page missing '{'");
            }
            var decls = comments();
            var decl;
            while ((decl = declaration())) {
                decls.push(decl);
                decls = decls.concat(comments());
            }
            if (!close()) {
                return error("@page missing '}'");
            }
            return pos({
                type: 'page',
                selectors: sel,
                declarations: decls
            });
        }
        function atdocument() {
            var pos = position();
            var m = match(/^@([-\w]+)?document *([^{]+)/);
            if (!m) {
                return;
            }
            var vendor = trim(m[1]);
            var doc = trim(m[2]);
            if (!open()) {
                return error("@document missing '{'");
            }
            var style = comments().concat(rules());
            if (!close()) {
                return error("@document missing '}'");
            }
            return pos({
                type: 'document',
                document: doc,
                vendor: vendor,
                rules: style
            });
        }
        function atfontface() {
            var pos = position();
            var m = match(/^@font-face\s*/);
            if (!m) {
                return;
            }
            if (!open()) {
                return error("@font-face missing '{'");
            }
            var decls = comments();
            var decl;
            while ((decl = declaration())) {
                decls.push(decl);
                decls = decls.concat(comments());
            }
            if (!close()) {
                return error("@font-face missing '}'");
            }
            return pos({
                type: 'font-face',
                declarations: decls
            });
        }
        var atimport = _compileAtrule('import');
        var atcharset = _compileAtrule('charset');
        var atnamespace = _compileAtrule('namespace');
        function _compileAtrule(name) {
            var re = new RegExp('^@' + name + '\\s*([^;]+);');
            return function () {
                var pos = position();
                var m = match(re);
                if (!m) {
                    return;
                }
                var ret = { type: name };
                ret[name] = m[1].trim();
                return pos(ret);
            };
        }
        function atrule() {
            if (css[0] !== '@') {
                return;
            }
            return (atkeyframes() ||
                atmedia() ||
                atcustommedia() ||
                atsupports() ||
                atimport() ||
                atcharset() ||
                atnamespace() ||
                atdocument() ||
                atpage() ||
                athost() ||
                atfontface());
        }
        function rule() {
            var pos = position();
            var sel = selector();
            if (!sel) {
                return error('selector missing');
            }
            comments();
            return pos({
                type: 'rule',
                selectors: sel,
                declarations: declarations()
            });
        }
        return addParent(stylesheet());
    }
    function trim(str) {
        return str ? str.replace(/^\s+|\s+$/g, '') : '';
    }
    function addParent(obj, parent) {
        var isNode = obj && typeof obj.type === 'string';
        var childParent = isNode ? obj : parent;
        for (var _i = 0, _a = Object.keys(obj); _i < _a.length; _i++) {
            var k = _a[_i];
            var value = obj[k];
            if (Array.isArray(value)) {
                value.forEach(function (v) {
                    addParent(v, childParent);
                });
            }
            else if (value && typeof value === 'object') {
                addParent(value, childParent);
            }
        }
        if (isNode) {
            Object.defineProperty(obj, 'parent', {
                configurable: true,
                writable: true,
                enumerable: false,
                value: parent || null
            });
        }
        return obj;
    }

    var tagMap = {
        script: 'noscript',
        altglyph: 'altGlyph',
        altglyphdef: 'altGlyphDef',
        altglyphitem: 'altGlyphItem',
        animatecolor: 'animateColor',
        animatemotion: 'animateMotion',
        animatetransform: 'animateTransform',
        clippath: 'clipPath',
        feblend: 'feBlend',
        fecolormatrix: 'feColorMatrix',
        fecomponenttransfer: 'feComponentTransfer',
        fecomposite: 'feComposite',
        feconvolvematrix: 'feConvolveMatrix',
        fediffuselighting: 'feDiffuseLighting',
        fedisplacementmap: 'feDisplacementMap',
        fedistantlight: 'feDistantLight',
        fedropshadow: 'feDropShadow',
        feflood: 'feFlood',
        fefunca: 'feFuncA',
        fefuncb: 'feFuncB',
        fefuncg: 'feFuncG',
        fefuncr: 'feFuncR',
        fegaussianblur: 'feGaussianBlur',
        feimage: 'feImage',
        femerge: 'feMerge',
        femergenode: 'feMergeNode',
        femorphology: 'feMorphology',
        feoffset: 'feOffset',
        fepointlight: 'fePointLight',
        fespecularlighting: 'feSpecularLighting',
        fespotlight: 'feSpotLight',
        fetile: 'feTile',
        feturbulence: 'feTurbulence',
        foreignobject: 'foreignObject',
        glyphref: 'glyphRef',
        lineargradient: 'linearGradient',
        radialgradient: 'radialGradient'
    };
    function getTagName(n) {
        var tagName = tagMap[n.tagName] ? tagMap[n.tagName] : n.tagName;
        if (tagName === 'link' && n.attributes._cssText) {
            tagName = 'style';
        }
        return tagName;
    }
    function escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    var HOVER_SELECTOR = /([^\\]):hover/;
    var HOVER_SELECTOR_GLOBAL = new RegExp(HOVER_SELECTOR.source, 'g');
    function addHoverClass(cssText, cache) {
        var cachedStyle = cache === null || cache === void 0 ? void 0 : cache.stylesWithHoverClass.get(cssText);
        if (cachedStyle)
            return cachedStyle;
        var ast = parse(cssText, {
            silent: true
        });
        if (!ast.stylesheet) {
            return cssText;
        }
        var selectors = [];
        ast.stylesheet.rules.forEach(function (rule) {
            if ('selectors' in rule) {
                (rule.selectors || []).forEach(function (selector) {
                    if (HOVER_SELECTOR.test(selector)) {
                        selectors.push(selector);
                    }
                });
            }
        });
        if (selectors.length === 0) {
            return cssText;
        }
        var selectorMatcher = new RegExp(selectors
            .filter(function (selector, index) { return selectors.indexOf(selector) === index; })
            .sort(function (a, b) { return b.length - a.length; })
            .map(function (selector) {
            return escapeRegExp(selector);
        })
            .join('|'), 'g');
        var result = cssText.replace(selectorMatcher, function (selector) {
            var newSelector = selector.replace(HOVER_SELECTOR_GLOBAL, '$1.\\:hover');
            return "".concat(selector, ", ").concat(newSelector);
        });
        cache === null || cache === void 0 ? void 0 : cache.stylesWithHoverClass.set(cssText, result);
        return result;
    }
    function createCache() {
        var stylesWithHoverClass = new Map();
        return {
            stylesWithHoverClass: stylesWithHoverClass
        };
    }
    function buildNode(n, options) {
        var doc = options.doc, hackCss = options.hackCss, cache = options.cache;
        switch (n.type) {
            case NodeType$2.Document:
                return doc.implementation.createDocument(null, '', null);
            case NodeType$2.DocumentType:
                return doc.implementation.createDocumentType(n.name || 'html', n.publicId, n.systemId);
            case NodeType$2.Element: {
                var tagName = getTagName(n);
                var node_1;
                if (n.isSVG) {
                    node_1 = doc.createElementNS('http://www.w3.org/2000/svg', tagName);
                }
                else {
                    node_1 = doc.createElement(tagName);
                }
                var specialAttributes = {};
                for (var name_1 in n.attributes) {
                    if (!Object.prototype.hasOwnProperty.call(n.attributes, name_1)) {
                        continue;
                    }
                    var value = n.attributes[name_1];
                    if (tagName === 'option' &&
                        name_1 === 'selected' &&
                        value === false) {
                        continue;
                    }
                    if (value === null) {
                        continue;
                    }
                    if (value === true)
                        value = '';
                    if (name_1.startsWith('rr_')) {
                        specialAttributes[name_1] = value;
                        continue;
                    }
                    var isTextarea = tagName === 'textarea' && name_1 === 'value';
                    var isRemoteOrDynamicCss = tagName === 'style' && name_1 === '_cssText';
                    if (isRemoteOrDynamicCss && hackCss && typeof value === 'string') {
                        value = addHoverClass(value, cache);
                    }
                    if ((isTextarea || isRemoteOrDynamicCss) && typeof value === 'string') {
                        var child = doc.createTextNode(value);
                        for (var _i = 0, _a = Array.from(node_1.childNodes); _i < _a.length; _i++) {
                            var c = _a[_i];
                            if (c.nodeType === node_1.TEXT_NODE) {
                                node_1.removeChild(c);
                            }
                        }
                        node_1.appendChild(child);
                        continue;
                    }
                    try {
                        if (n.isSVG && name_1 === 'xlink:href') {
                            node_1.setAttributeNS('http://www.w3.org/1999/xlink', name_1, value.toString());
                        }
                        else if (name_1 === 'onload' ||
                            name_1 === 'onclick' ||
                            name_1.substring(0, 7) === 'onmouse') {
                            node_1.setAttribute('_' + name_1, value.toString());
                        }
                        else if (tagName === 'meta' &&
                            n.attributes['http-equiv'] === 'Content-Security-Policy' &&
                            name_1 === 'content') {
                            node_1.setAttribute('csp-content', value.toString());
                            continue;
                        }
                        else if (tagName === 'link' &&
                            (n.attributes.rel === 'preload' ||
                                n.attributes.rel === 'modulepreload') &&
                            n.attributes.as === 'script') {
                        }
                        else if (tagName === 'link' &&
                            n.attributes.rel === 'prefetch' &&
                            typeof n.attributes.href === 'string' &&
                            n.attributes.href.endsWith('.js')) {
                        }
                        else if (tagName === 'img' &&
                            n.attributes.srcset &&
                            n.attributes.rr_dataURL) {
                            node_1.setAttribute('rrweb-original-srcset', n.attributes.srcset);
                        }
                        else {
                            node_1.setAttribute(name_1, value.toString());
                        }
                    }
                    catch (error) {
                    }
                }
                var _loop_1 = function (name_2) {
                    var value = specialAttributes[name_2];
                    if (tagName === 'canvas' && name_2 === 'rr_dataURL') {
                        var image_1 = document.createElement('img');
                        image_1.onload = function () {
                            var ctx = node_1.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(image_1, 0, 0, image_1.width, image_1.height);
                            }
                        };
                        image_1.src = value.toString();
                        if (node_1.RRNodeType)
                            node_1.rr_dataURL = value.toString();
                    }
                    else if (tagName === 'img' && name_2 === 'rr_dataURL') {
                        var image = node_1;
                        if (!image.currentSrc.startsWith('data:')) {
                            image.setAttribute('rrweb-original-src', n.attributes.src);
                            image.src = value.toString();
                        }
                    }
                    if (name_2 === 'rr_width') {
                        node_1.style.width = value.toString();
                    }
                    else if (name_2 === 'rr_height') {
                        node_1.style.height = value.toString();
                    }
                    else if (name_2 === 'rr_mediaCurrentTime' &&
                        typeof value === 'number') {
                        node_1.currentTime = value;
                    }
                    else if (name_2 === 'rr_mediaState') {
                        switch (value) {
                            case 'played':
                                node_1
                                    .play()["catch"](function (e) { return console.warn('media playback error', e); });
                                break;
                            case 'paused':
                                node_1.pause();
                                break;
                        }
                    }
                };
                for (var name_2 in specialAttributes) {
                    _loop_1(name_2);
                }
                if (n.isShadowHost) {
                    if (!node_1.shadowRoot) {
                        node_1.attachShadow({ mode: 'open' });
                    }
                    else {
                        while (node_1.shadowRoot.firstChild) {
                            node_1.shadowRoot.removeChild(node_1.shadowRoot.firstChild);
                        }
                    }
                }
                return node_1;
            }
            case NodeType$2.Text:
                return doc.createTextNode(n.isStyle && hackCss
                    ? addHoverClass(n.textContent, cache)
                    : n.textContent);
            case NodeType$2.CDATA:
                return doc.createCDATASection(n.textContent);
            case NodeType$2.Comment:
                return doc.createComment(n.textContent);
            default:
                return null;
        }
    }
    function buildNodeWithSN(n, options) {
        var doc = options.doc, mirror = options.mirror, _a = options.skipChild, skipChild = _a === void 0 ? false : _a, _b = options.hackCss, hackCss = _b === void 0 ? true : _b, afterAppend = options.afterAppend, cache = options.cache;
        if (mirror.has(n.id)) {
            var nodeInMirror = mirror.getNode(n.id);
            var meta = mirror.getMeta(nodeInMirror);
            if (isNodeMetaEqual(meta, n))
                return mirror.getNode(n.id);
        }
        var node = buildNode(n, { doc: doc, hackCss: hackCss, cache: cache });
        if (!node) {
            return null;
        }
        if (n.rootId && mirror.getNode(n.rootId) !== doc) {
            mirror.replace(n.rootId, doc);
        }
        if (n.type === NodeType$2.Document) {
            doc.close();
            doc.open();
            if (n.compatMode === 'BackCompat' &&
                n.childNodes &&
                n.childNodes[0].type !== NodeType$2.DocumentType) {
                if (n.childNodes[0].type === NodeType$2.Element &&
                    'xmlns' in n.childNodes[0].attributes &&
                    n.childNodes[0].attributes.xmlns === 'http://www.w3.org/1999/xhtml') {
                    doc.write('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "">');
                }
                else {
                    doc.write('<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN" "">');
                }
            }
            node = doc;
        }
        mirror.add(node, n);
        if ((n.type === NodeType$2.Document || n.type === NodeType$2.Element) &&
            !skipChild) {
            var _loop_2 = function (childN) {
                var childNode = buildNodeWithSN(childN, {
                    doc: doc,
                    mirror: mirror,
                    skipChild: false,
                    hackCss: hackCss,
                    afterAppend: afterAppend,
                    cache: cache
                });
                if (!childNode) {
                    console.warn('Failed to rebuild', childN);
                    return "continue";
                }
                if (childN.isShadow && isElement(node) && node.shadowRoot) {
                    node.shadowRoot.appendChild(childNode);
                }
                else if (n.type === NodeType$2.Document &&
                    childN.type == NodeType$2.Element) {
                    var htmlElement = childNode;
                    var body_1 = null;
                    htmlElement.childNodes.forEach(function (child) {
                        if (child.nodeName === 'BODY')
                            body_1 = child;
                    });
                    if (body_1) {
                        htmlElement.removeChild(body_1);
                        node.appendChild(childNode);
                        htmlElement.appendChild(body_1);
                    }
                    else {
                        node.appendChild(childNode);
                    }
                }
                else {
                    node.appendChild(childNode);
                }
                if (afterAppend) {
                    afterAppend(childNode, childN.id);
                }
            };
            for (var _i = 0, _c = n.childNodes; _i < _c.length; _i++) {
                var childN = _c[_i];
                _loop_2(childN);
            }
        }
        return node;
    }
    function visit(mirror, onVisit) {
        function walk(node) {
            onVisit(node);
        }
        for (var _i = 0, _a = mirror.getIds(); _i < _a.length; _i++) {
            var id = _a[_i];
            if (mirror.has(id)) {
                walk(mirror.getNode(id));
            }
        }
    }
    function handleScroll(node, mirror) {
        var n = mirror.getMeta(node);
        if ((n === null || n === void 0 ? void 0 : n.type) !== NodeType$2.Element) {
            return;
        }
        var el = node;
        for (var name_3 in n.attributes) {
            if (!(Object.prototype.hasOwnProperty.call(n.attributes, name_3) &&
                name_3.startsWith('rr_'))) {
                continue;
            }
            var value = n.attributes[name_3];
            if (name_3 === 'rr_scrollLeft') {
                el.scrollLeft = value;
            }
            if (name_3 === 'rr_scrollTop') {
                el.scrollTop = value;
            }
        }
    }
    function rebuild(n, options) {
        var doc = options.doc, onVisit = options.onVisit, _a = options.hackCss, hackCss = _a === void 0 ? true : _a, afterAppend = options.afterAppend, cache = options.cache, _b = options.mirror, mirror = _b === void 0 ? new Mirror$2() : _b;
        var node = buildNodeWithSN(n, {
            doc: doc,
            mirror: mirror,
            skipChild: false,
            hackCss: hackCss,
            afterAppend: afterAppend,
            cache: cache
        });
        visit(mirror, function (visitedNode) {
            if (onVisit) {
                onVisit(visitedNode);
            }
            handleScroll(visitedNode, mirror);
        });
        return node;
    }

    const DEPARTED_MIRROR_ACCESS_WARNING = 'Please stop import mirror directly. Instead of that,' +
        '\r\n' +
        'now you can use replayer.getMirror() to access the mirror instance of a replayer,' +
        '\r\n' +
        'or you can use record.mirror to access the mirror instance during recording.';
    let _mirror = {
        map: {},
        getId() {
            console.error(DEPARTED_MIRROR_ACCESS_WARNING);
            return -1;
        },
        getNode() {
            console.error(DEPARTED_MIRROR_ACCESS_WARNING);
            return null;
        },
        removeNodeFromMap() {
            console.error(DEPARTED_MIRROR_ACCESS_WARNING);
        },
        has() {
            console.error(DEPARTED_MIRROR_ACCESS_WARNING);
            return false;
        },
        reset() {
            console.error(DEPARTED_MIRROR_ACCESS_WARNING);
        },
    };
    if (typeof window !== 'undefined' && window.Proxy && window.Reflect) {
        _mirror = new Proxy(_mirror, {
            get(target, prop, receiver) {
                if (prop === 'map') {
                    console.error(DEPARTED_MIRROR_ACCESS_WARNING);
                }
                return Reflect.get(target, prop, receiver);
            },
        });
    }
    if (!(/[1-9][0-9]{12}/.test(Date.now().toString()))) ;
    function polyfill$1(win = window) {
        if ('NodeList' in win && !win.NodeList.prototype.forEach) {
            win.NodeList.prototype.forEach = Array.prototype
                .forEach;
        }
        if ('DOMTokenList' in win && !win.DOMTokenList.prototype.forEach) {
            win.DOMTokenList.prototype.forEach = Array.prototype
                .forEach;
        }
        if (!Node.prototype.contains) {
            Node.prototype.contains = (...args) => {
                let node = args[0];
                if (!(0 in args)) {
                    throw new TypeError('1 argument is required');
                }
                do {
                    if (this === node) {
                        return true;
                    }
                } while ((node = node && node.parentNode));
                return false;
            };
        }
    }
    function queueToResolveTrees(queue) {
        const queueNodeMap = {};
        const putIntoMap = (m, parent) => {
            const nodeInTree = {
                value: m,
                parent,
                children: [],
            };
            queueNodeMap[m.node.id] = nodeInTree;
            return nodeInTree;
        };
        const queueNodeTrees = [];
        for (const mutation of queue) {
            const { nextId, parentId } = mutation;
            if (nextId && nextId in queueNodeMap) {
                const nextInTree = queueNodeMap[nextId];
                if (nextInTree.parent) {
                    const idx = nextInTree.parent.children.indexOf(nextInTree);
                    nextInTree.parent.children.splice(idx, 0, putIntoMap(mutation, nextInTree.parent));
                }
                else {
                    const idx = queueNodeTrees.indexOf(nextInTree);
                    queueNodeTrees.splice(idx, 0, putIntoMap(mutation, null));
                }
                continue;
            }
            if (parentId in queueNodeMap) {
                const parentInTree = queueNodeMap[parentId];
                parentInTree.children.push(putIntoMap(mutation, parentInTree));
                continue;
            }
            queueNodeTrees.push(putIntoMap(mutation, null));
        }
        return queueNodeTrees;
    }
    function iterateResolveTree(tree, cb) {
        cb(tree.value);
        for (let i = tree.children.length - 1; i >= 0; i--) {
            iterateResolveTree(tree.children[i], cb);
        }
    }
    function isSerializedIframe(n, mirror) {
        return Boolean(n.nodeName === 'IFRAME' && mirror.getMeta(n));
    }
    function getBaseDimension(node, rootIframe) {
        var _a, _b;
        const frameElement = (_b = (_a = node.ownerDocument) === null || _a === void 0 ? void 0 : _a.defaultView) === null || _b === void 0 ? void 0 : _b.frameElement;
        if (!frameElement || frameElement === rootIframe) {
            return {
                x: 0,
                y: 0,
                relativeScale: 1,
                absoluteScale: 1,
            };
        }
        const frameDimension = frameElement.getBoundingClientRect();
        const frameBaseDimension = getBaseDimension(frameElement, rootIframe);
        const relativeScale = frameDimension.height / frameElement.clientHeight;
        return {
            x: frameDimension.x * frameBaseDimension.relativeScale +
                frameBaseDimension.x,
            y: frameDimension.y * frameBaseDimension.relativeScale +
                frameBaseDimension.y,
            relativeScale,
            absoluteScale: frameBaseDimension.absoluteScale * relativeScale,
        };
    }
    function hasShadowRoot(n) {
        return Boolean(n === null || n === void 0 ? void 0 : n.shadowRoot);
    }
    function getNestedRule(rules, position) {
        const rule = rules[position[0]];
        if (position.length === 1) {
            return rule;
        }
        else {
            return getNestedRule(rule.cssRules[position[1]].cssRules, position.slice(2));
        }
    }
    function getPositionsAndIndex(nestedIndex) {
        const positions = [...nestedIndex];
        const index = positions.pop();
        return { positions, index };
    }
    function uniqueTextMutations(mutations) {
        const idSet = new Set();
        const uniqueMutations = [];
        for (let i = mutations.length; i--;) {
            const mutation = mutations[i];
            if (!idSet.has(mutation.id)) {
                uniqueMutations.push(mutation);
                idSet.add(mutation.id);
            }
        }
        return uniqueMutations;
    }
    class StyleSheetMirror {
        constructor() {
            this.id = 1;
            this.styleIDMap = new WeakMap();
            this.idStyleMap = new Map();
        }
        getId(stylesheet) {
            var _a;
            return (_a = this.styleIDMap.get(stylesheet)) !== null && _a !== void 0 ? _a : -1;
        }
        has(stylesheet) {
            return this.styleIDMap.has(stylesheet);
        }
        add(stylesheet, id) {
            if (this.has(stylesheet))
                return this.getId(stylesheet);
            let newId;
            if (id === undefined) {
                newId = this.id++;
            }
            else
                newId = id;
            this.styleIDMap.set(stylesheet, newId);
            this.idStyleMap.set(newId, stylesheet);
            return newId;
        }
        getStyle(id) {
            return this.idStyleMap.get(id) || null;
        }
        reset() {
            this.styleIDMap = new WeakMap();
            this.idStyleMap = new Map();
            this.id = 1;
        }
        generateId() {
            return this.id++;
        }
    }

    var EventType = /* @__PURE__ */ ((EventType2) => {
      EventType2[EventType2["DomContentLoaded"] = 0] = "DomContentLoaded";
      EventType2[EventType2["Load"] = 1] = "Load";
      EventType2[EventType2["FullSnapshot"] = 2] = "FullSnapshot";
      EventType2[EventType2["IncrementalSnapshot"] = 3] = "IncrementalSnapshot";
      EventType2[EventType2["Meta"] = 4] = "Meta";
      EventType2[EventType2["Custom"] = 5] = "Custom";
      EventType2[EventType2["Plugin"] = 6] = "Plugin";
      return EventType2;
    })(EventType || {});
    var IncrementalSource = /* @__PURE__ */ ((IncrementalSource2) => {
      IncrementalSource2[IncrementalSource2["Mutation"] = 0] = "Mutation";
      IncrementalSource2[IncrementalSource2["MouseMove"] = 1] = "MouseMove";
      IncrementalSource2[IncrementalSource2["MouseInteraction"] = 2] = "MouseInteraction";
      IncrementalSource2[IncrementalSource2["Scroll"] = 3] = "Scroll";
      IncrementalSource2[IncrementalSource2["ViewportResize"] = 4] = "ViewportResize";
      IncrementalSource2[IncrementalSource2["Input"] = 5] = "Input";
      IncrementalSource2[IncrementalSource2["TouchMove"] = 6] = "TouchMove";
      IncrementalSource2[IncrementalSource2["MediaInteraction"] = 7] = "MediaInteraction";
      IncrementalSource2[IncrementalSource2["StyleSheetRule"] = 8] = "StyleSheetRule";
      IncrementalSource2[IncrementalSource2["CanvasMutation"] = 9] = "CanvasMutation";
      IncrementalSource2[IncrementalSource2["Font"] = 10] = "Font";
      IncrementalSource2[IncrementalSource2["Log"] = 11] = "Log";
      IncrementalSource2[IncrementalSource2["Drag"] = 12] = "Drag";
      IncrementalSource2[IncrementalSource2["StyleDeclaration"] = 13] = "StyleDeclaration";
      IncrementalSource2[IncrementalSource2["Selection"] = 14] = "Selection";
      IncrementalSource2[IncrementalSource2["AdoptedStyleSheet"] = 15] = "AdoptedStyleSheet";
      return IncrementalSource2;
    })(IncrementalSource || {});
    var MouseInteractions = /* @__PURE__ */ ((MouseInteractions2) => {
      MouseInteractions2[MouseInteractions2["MouseUp"] = 0] = "MouseUp";
      MouseInteractions2[MouseInteractions2["MouseDown"] = 1] = "MouseDown";
      MouseInteractions2[MouseInteractions2["Click"] = 2] = "Click";
      MouseInteractions2[MouseInteractions2["ContextMenu"] = 3] = "ContextMenu";
      MouseInteractions2[MouseInteractions2["DblClick"] = 4] = "DblClick";
      MouseInteractions2[MouseInteractions2["Focus"] = 5] = "Focus";
      MouseInteractions2[MouseInteractions2["Blur"] = 6] = "Blur";
      MouseInteractions2[MouseInteractions2["TouchStart"] = 7] = "TouchStart";
      MouseInteractions2[MouseInteractions2["TouchMove_Departed"] = 8] = "TouchMove_Departed";
      MouseInteractions2[MouseInteractions2["TouchEnd"] = 9] = "TouchEnd";
      MouseInteractions2[MouseInteractions2["TouchCancel"] = 10] = "TouchCancel";
      return MouseInteractions2;
    })(MouseInteractions || {});
    var CanvasContext = /* @__PURE__ */ ((CanvasContext2) => {
      CanvasContext2[CanvasContext2["2D"] = 0] = "2D";
      CanvasContext2[CanvasContext2["WebGL"] = 1] = "WebGL";
      CanvasContext2[CanvasContext2["WebGL2"] = 2] = "WebGL2";
      return CanvasContext2;
    })(CanvasContext || {});
    var ReplayerEvents = /* @__PURE__ */ ((ReplayerEvents2) => {
      ReplayerEvents2["Start"] = "start";
      ReplayerEvents2["Pause"] = "pause";
      ReplayerEvents2["Resume"] = "resume";
      ReplayerEvents2["Resize"] = "resize";
      ReplayerEvents2["Finish"] = "finish";
      ReplayerEvents2["FullsnapshotRebuilded"] = "fullsnapshot-rebuilded";
      ReplayerEvents2["LoadStylesheetStart"] = "load-stylesheet-start";
      ReplayerEvents2["LoadStylesheetEnd"] = "load-stylesheet-end";
      ReplayerEvents2["SkipStart"] = "skip-start";
      ReplayerEvents2["SkipEnd"] = "skip-end";
      ReplayerEvents2["MouseInteraction"] = "mouse-interaction";
      ReplayerEvents2["EventCast"] = "event-cast";
      ReplayerEvents2["CustomEvent"] = "custom-event";
      ReplayerEvents2["Flush"] = "flush";
      ReplayerEvents2["StateChange"] = "state-change";
      ReplayerEvents2["PlayBack"] = "play-back";
      ReplayerEvents2["Destroy"] = "destroy";
      return ReplayerEvents2;
    })(ReplayerEvents || {});

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    /*
     * base64-arraybuffer 1.0.1 <https://github.com/niklasvh/base64-arraybuffer>
     * Copyright (c) 2021 Niklas von Hertzen <https://hertzen.com>
     * Released under MIT License
     */
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    // Use a lookup table to find the index.
    var lookup = typeof Uint8Array === 'undefined' ? [] : new Uint8Array(256);
    for (var i$2 = 0; i$2 < chars.length; i$2++) {
        lookup[chars.charCodeAt(i$2)] = i$2;
    }
    var decode = function (base64) {
        var bufferLength = base64.length * 0.75, len = base64.length, i, p = 0, encoded1, encoded2, encoded3, encoded4;
        if (base64[base64.length - 1] === '=') {
            bufferLength--;
            if (base64[base64.length - 2] === '=') {
                bufferLength--;
            }
        }
        var arraybuffer = new ArrayBuffer(bufferLength), bytes = new Uint8Array(arraybuffer);
        for (i = 0; i < len; i += 4) {
            encoded1 = lookup[base64.charCodeAt(i)];
            encoded2 = lookup[base64.charCodeAt(i + 1)];
            encoded3 = lookup[base64.charCodeAt(i + 2)];
            encoded4 = lookup[base64.charCodeAt(i + 3)];
            bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
            bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
            bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
        }
        return arraybuffer;
    };

    createMirror$2();

    var NodeType$1;
    (function (NodeType) {
        NodeType[NodeType["Document"] = 0] = "Document";
        NodeType[NodeType["DocumentType"] = 1] = "DocumentType";
        NodeType[NodeType["Element"] = 2] = "Element";
        NodeType[NodeType["Text"] = 3] = "Text";
        NodeType[NodeType["CDATA"] = 4] = "CDATA";
        NodeType[NodeType["Comment"] = 5] = "Comment";
    })(NodeType$1 || (NodeType$1 = {}));
    var Mirror$1 = (function () {
        function Mirror() {
            this.idNodeMap = new Map();
            this.nodeMetaMap = new WeakMap();
        }
        Mirror.prototype.getId = function (n) {
            var _a;
            if (!n)
                return -1;
            var id = (_a = this.getMeta(n)) === null || _a === void 0 ? void 0 : _a.id;
            return id !== null && id !== void 0 ? id : -1;
        };
        Mirror.prototype.getNode = function (id) {
            return this.idNodeMap.get(id) || null;
        };
        Mirror.prototype.getIds = function () {
            return Array.from(this.idNodeMap.keys());
        };
        Mirror.prototype.getMeta = function (n) {
            return this.nodeMetaMap.get(n) || null;
        };
        Mirror.prototype.removeNodeFromMap = function (n) {
            var _this = this;
            var id = this.getId(n);
            this.idNodeMap["delete"](id);
            if (n.childNodes) {
                n.childNodes.forEach(function (childNode) {
                    return _this.removeNodeFromMap(childNode);
                });
            }
        };
        Mirror.prototype.has = function (id) {
            return this.idNodeMap.has(id);
        };
        Mirror.prototype.hasNode = function (node) {
            return this.nodeMetaMap.has(node);
        };
        Mirror.prototype.add = function (n, meta) {
            var id = meta.id;
            this.idNodeMap.set(id, n);
            this.nodeMetaMap.set(n, meta);
        };
        Mirror.prototype.replace = function (id, n) {
            var oldNode = this.getNode(id);
            if (oldNode) {
                var meta = this.nodeMetaMap.get(oldNode);
                if (meta)
                    this.nodeMetaMap.set(n, meta);
            }
            this.idNodeMap.set(id, n);
        };
        Mirror.prototype.reset = function () {
            this.idNodeMap = new Map();
            this.nodeMetaMap = new WeakMap();
        };
        return Mirror;
    }());
    function createMirror$1() {
        return new Mirror$1();
    }

    function parseCSSText(cssText) {
        const res = {};
        const listDelimiter = /;(?![^(]*\))/g;
        const propertyDelimiter = /:(.+)/;
        const comment = /\/\*.*?\*\//g;
        cssText
            .replace(comment, '')
            .split(listDelimiter)
            .forEach(function (item) {
            if (item) {
                const tmp = item.split(propertyDelimiter);
                tmp.length > 1 && (res[camelize(tmp[0].trim())] = tmp[1].trim());
            }
        });
        return res;
    }
    function toCSSText(style) {
        const properties = [];
        for (const name in style) {
            const value = style[name];
            if (typeof value !== 'string')
                continue;
            const normalizedName = hyphenate(name);
            properties.push(`${normalizedName}: ${value};`);
        }
        return properties.join(' ');
    }
    const camelizeRE = /-([a-z])/g;
    const CUSTOM_PROPERTY_REGEX = /^--[a-zA-Z0-9-]+$/;
    const camelize = (str) => {
        if (CUSTOM_PROPERTY_REGEX.test(str))
            return str;
        return str.replace(camelizeRE, (_, c) => (c ? c.toUpperCase() : ''));
    };
    const hyphenateRE = /\B([A-Z])/g;
    const hyphenate = (str) => {
        return str.replace(hyphenateRE, '-$1').toLowerCase();
    };

    class BaseRRNode {
        constructor(..._args) {
            this.parentElement = null;
            this.parentNode = null;
            this.firstChild = null;
            this.lastChild = null;
            this.previousSibling = null;
            this.nextSibling = null;
            this.ELEMENT_NODE = NodeType.ELEMENT_NODE;
            this.TEXT_NODE = NodeType.TEXT_NODE;
        }
        get childNodes() {
            const childNodes = [];
            let childIterator = this.firstChild;
            while (childIterator) {
                childNodes.push(childIterator);
                childIterator = childIterator.nextSibling;
            }
            return childNodes;
        }
        contains(node) {
            if (!(node instanceof BaseRRNode))
                return false;
            else if (node.ownerDocument !== this.ownerDocument)
                return false;
            else if (node === this)
                return true;
            while (node.parentNode) {
                if (node.parentNode === this)
                    return true;
                node = node.parentNode;
            }
            return false;
        }
        appendChild(_newChild) {
            throw new Error(`RRDomException: Failed to execute 'appendChild' on 'RRNode': This RRNode type does not support this method.`);
        }
        insertBefore(_newChild, _refChild) {
            throw new Error(`RRDomException: Failed to execute 'insertBefore' on 'RRNode': This RRNode type does not support this method.`);
        }
        removeChild(_node) {
            throw new Error(`RRDomException: Failed to execute 'removeChild' on 'RRNode': This RRNode type does not support this method.`);
        }
        toString() {
            return 'RRNode';
        }
    }
    function BaseRRDocumentImpl(RRNodeClass) {
        return class BaseRRDocument extends RRNodeClass {
            constructor(...args) {
                super(args);
                this.nodeType = NodeType.DOCUMENT_NODE;
                this.nodeName = '#document';
                this.compatMode = 'CSS1Compat';
                this.RRNodeType = NodeType$1.Document;
                this.textContent = null;
                this.ownerDocument = this;
            }
            get documentElement() {
                return (this.childNodes.find((node) => node.RRNodeType === NodeType$1.Element &&
                    node.tagName === 'HTML') || null);
            }
            get body() {
                var _a;
                return (((_a = this.documentElement) === null || _a === void 0 ? void 0 : _a.childNodes.find((node) => node.RRNodeType === NodeType$1.Element &&
                    node.tagName === 'BODY')) || null);
            }
            get head() {
                var _a;
                return (((_a = this.documentElement) === null || _a === void 0 ? void 0 : _a.childNodes.find((node) => node.RRNodeType === NodeType$1.Element &&
                    node.tagName === 'HEAD')) || null);
            }
            get implementation() {
                return this;
            }
            get firstElementChild() {
                return this.documentElement;
            }
            appendChild(newChild) {
                const nodeType = newChild.RRNodeType;
                if (nodeType === NodeType$1.Element ||
                    nodeType === NodeType$1.DocumentType) {
                    if (this.childNodes.some((s) => s.RRNodeType === nodeType)) {
                        throw new Error(`RRDomException: Failed to execute 'appendChild' on 'RRNode': Only one ${nodeType === NodeType$1.Element ? 'RRElement' : 'RRDoctype'} on RRDocument allowed.`);
                    }
                }
                const child = appendChild(this, newChild);
                child.parentElement = null;
                return child;
            }
            insertBefore(newChild, refChild) {
                const nodeType = newChild.RRNodeType;
                if (nodeType === NodeType$1.Element ||
                    nodeType === NodeType$1.DocumentType) {
                    if (this.childNodes.some((s) => s.RRNodeType === nodeType)) {
                        throw new Error(`RRDomException: Failed to execute 'insertBefore' on 'RRNode': Only one ${nodeType === NodeType$1.Element ? 'RRElement' : 'RRDoctype'} on RRDocument allowed.`);
                    }
                }
                const child = insertBefore(this, newChild, refChild);
                child.parentElement = null;
                return child;
            }
            removeChild(node) {
                return removeChild(this, node);
            }
            open() {
                this.firstChild = null;
                this.lastChild = null;
            }
            close() {
            }
            write(content) {
                let publicId;
                if (content ===
                    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "">')
                    publicId = '-//W3C//DTD XHTML 1.0 Transitional//EN';
                else if (content ===
                    '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN" "">')
                    publicId = '-//W3C//DTD HTML 4.0 Transitional//EN';
                if (publicId) {
                    const doctype = this.createDocumentType('html', publicId, '');
                    this.open();
                    this.appendChild(doctype);
                }
            }
            createDocument(_namespace, _qualifiedName, _doctype) {
                return new BaseRRDocument();
            }
            createDocumentType(qualifiedName, publicId, systemId) {
                const doctype = new (BaseRRDocumentTypeImpl(BaseRRNode))(qualifiedName, publicId, systemId);
                doctype.ownerDocument = this;
                return doctype;
            }
            createElement(tagName) {
                const element = new (BaseRRElementImpl(BaseRRNode))(tagName);
                element.ownerDocument = this;
                return element;
            }
            createElementNS(_namespaceURI, qualifiedName) {
                return this.createElement(qualifiedName);
            }
            createTextNode(data) {
                const text = new (BaseRRTextImpl(BaseRRNode))(data);
                text.ownerDocument = this;
                return text;
            }
            createComment(data) {
                const comment = new (BaseRRCommentImpl(BaseRRNode))(data);
                comment.ownerDocument = this;
                return comment;
            }
            createCDATASection(data) {
                const CDATASection = new (BaseRRCDATASectionImpl(BaseRRNode))(data);
                CDATASection.ownerDocument = this;
                return CDATASection;
            }
            toString() {
                return 'RRDocument';
            }
        };
    }
    function BaseRRDocumentTypeImpl(RRNodeClass) {
        return class BaseRRDocumentType extends RRNodeClass {
            constructor(qualifiedName, publicId, systemId) {
                super();
                this.nodeType = NodeType.DOCUMENT_TYPE_NODE;
                this.RRNodeType = NodeType$1.DocumentType;
                this.name = qualifiedName;
                this.publicId = publicId;
                this.systemId = systemId;
                this.nodeName = qualifiedName;
                this.textContent = null;
            }
            toString() {
                return 'RRDocumentType';
            }
        };
    }
    function BaseRRElementImpl(RRNodeClass) {
        return class BaseRRElement extends RRNodeClass {
            constructor(tagName) {
                super();
                this.nodeType = NodeType.ELEMENT_NODE;
                this.RRNodeType = NodeType$1.Element;
                this.attributes = {};
                this.shadowRoot = null;
                this.tagName = tagName.toUpperCase();
                this.nodeName = tagName.toUpperCase();
            }
            get textContent() {
                let result = '';
                this.childNodes.forEach((node) => (result += node.textContent));
                return result;
            }
            set textContent(textContent) {
                this.firstChild = null;
                this.lastChild = null;
                this.appendChild(this.ownerDocument.createTextNode(textContent));
            }
            get classList() {
                return new ClassList(this.attributes.class, (newClassName) => {
                    this.attributes.class = newClassName;
                });
            }
            get id() {
                return this.attributes.id || '';
            }
            get className() {
                return this.attributes.class || '';
            }
            get style() {
                const style = (this.attributes.style ? parseCSSText(this.attributes.style) : {});
                const hyphenateRE = /\B([A-Z])/g;
                style.setProperty = (name, value, priority) => {
                    if (hyphenateRE.test(name))
                        return;
                    const normalizedName = camelize(name);
                    if (!value)
                        delete style[normalizedName];
                    else
                        style[normalizedName] = value;
                    if (priority === 'important')
                        style[normalizedName] += ' !important';
                    this.attributes.style = toCSSText(style);
                };
                style.removeProperty = (name) => {
                    if (hyphenateRE.test(name))
                        return '';
                    const normalizedName = camelize(name);
                    const value = style[normalizedName] || '';
                    delete style[normalizedName];
                    this.attributes.style = toCSSText(style);
                    return value;
                };
                return style;
            }
            getAttribute(name) {
                return this.attributes[name] || null;
            }
            setAttribute(name, attribute) {
                this.attributes[name] = attribute;
            }
            setAttributeNS(_namespace, qualifiedName, value) {
                this.setAttribute(qualifiedName, value);
            }
            removeAttribute(name) {
                delete this.attributes[name];
            }
            appendChild(newChild) {
                return appendChild(this, newChild);
            }
            insertBefore(newChild, refChild) {
                return insertBefore(this, newChild, refChild);
            }
            removeChild(node) {
                return removeChild(this, node);
            }
            attachShadow(_init) {
                const shadowRoot = this.ownerDocument.createElement('SHADOWROOT');
                this.shadowRoot = shadowRoot;
                return shadowRoot;
            }
            dispatchEvent(_event) {
                return true;
            }
            toString() {
                let attributeString = '';
                for (const attribute in this.attributes) {
                    attributeString += `${attribute}="${this.attributes[attribute]}" `;
                }
                return `${this.tagName} ${attributeString}`;
            }
        };
    }
    function BaseRRMediaElementImpl(RRElementClass) {
        return class BaseRRMediaElement extends RRElementClass {
            attachShadow(_init) {
                throw new Error(`RRDomException: Failed to execute 'attachShadow' on 'RRElement': This RRElement does not support attachShadow`);
            }
            play() {
                this.paused = false;
            }
            pause() {
                this.paused = true;
            }
        };
    }
    function BaseRRTextImpl(RRNodeClass) {
        return class BaseRRText extends RRNodeClass {
            constructor(data) {
                super();
                this.nodeType = NodeType.TEXT_NODE;
                this.nodeName = '#text';
                this.RRNodeType = NodeType$1.Text;
                this.data = data;
            }
            get textContent() {
                return this.data;
            }
            set textContent(textContent) {
                this.data = textContent;
            }
            toString() {
                return `RRText text=${JSON.stringify(this.data)}`;
            }
        };
    }
    function BaseRRCommentImpl(RRNodeClass) {
        return class BaseRRComment extends RRNodeClass {
            constructor(data) {
                super();
                this.nodeType = NodeType.COMMENT_NODE;
                this.nodeName = '#comment';
                this.RRNodeType = NodeType$1.Comment;
                this.data = data;
            }
            get textContent() {
                return this.data;
            }
            set textContent(textContent) {
                this.data = textContent;
            }
            toString() {
                return `RRComment text=${JSON.stringify(this.data)}`;
            }
        };
    }
    function BaseRRCDATASectionImpl(RRNodeClass) {
        return class BaseRRCDATASection extends RRNodeClass {
            constructor(data) {
                super();
                this.nodeName = '#cdata-section';
                this.nodeType = NodeType.CDATA_SECTION_NODE;
                this.RRNodeType = NodeType$1.CDATA;
                this.data = data;
            }
            get textContent() {
                return this.data;
            }
            set textContent(textContent) {
                this.data = textContent;
            }
            toString() {
                return `RRCDATASection data=${JSON.stringify(this.data)}`;
            }
        };
    }
    class ClassList {
        constructor(classText, onChange) {
            this.classes = [];
            this.add = (...classNames) => {
                for (const item of classNames) {
                    const className = String(item);
                    if (this.classes.indexOf(className) >= 0)
                        continue;
                    this.classes.push(className);
                }
                this.onChange && this.onChange(this.classes.join(' '));
            };
            this.remove = (...classNames) => {
                this.classes = this.classes.filter((item) => classNames.indexOf(item) === -1);
                this.onChange && this.onChange(this.classes.join(' '));
            };
            if (classText) {
                const classes = classText.trim().split(/\s+/);
                this.classes.push(...classes);
            }
            this.onChange = onChange;
        }
    }
    function appendChild(parent, newChild) {
        if (newChild.parentNode)
            newChild.parentNode.removeChild(newChild);
        if (parent.lastChild) {
            parent.lastChild.nextSibling = newChild;
            newChild.previousSibling = parent.lastChild;
        }
        else {
            parent.firstChild = newChild;
            newChild.previousSibling = null;
        }
        parent.lastChild = newChild;
        newChild.nextSibling = null;
        newChild.parentNode = parent;
        newChild.parentElement = parent;
        newChild.ownerDocument = parent.ownerDocument;
        return newChild;
    }
    function insertBefore(parent, newChild, refChild) {
        if (!refChild)
            return appendChild(parent, newChild);
        if (refChild.parentNode !== parent)
            throw new Error("Failed to execute 'insertBefore' on 'RRNode': The RRNode before which the new node is to be inserted is not a child of this RRNode.");
        if (newChild === refChild)
            return newChild;
        if (newChild.parentNode)
            newChild.parentNode.removeChild(newChild);
        newChild.previousSibling = refChild.previousSibling;
        refChild.previousSibling = newChild;
        newChild.nextSibling = refChild;
        if (newChild.previousSibling)
            newChild.previousSibling.nextSibling = newChild;
        else
            parent.firstChild = newChild;
        newChild.parentElement = parent;
        newChild.parentNode = parent;
        newChild.ownerDocument = parent.ownerDocument;
        return newChild;
    }
    function removeChild(parent, child) {
        if (child.parentNode !== parent)
            throw new Error("Failed to execute 'removeChild' on 'RRNode': The RRNode to be removed is not a child of this RRNode.");
        if (child.previousSibling)
            child.previousSibling.nextSibling = child.nextSibling;
        else
            parent.firstChild = child.nextSibling;
        if (child.nextSibling)
            child.nextSibling.previousSibling = child.previousSibling;
        else
            parent.lastChild = child.previousSibling;
        child.previousSibling = null;
        child.nextSibling = null;
        child.parentElement = null;
        child.parentNode = null;
        return child;
    }
    var NodeType;
    (function (NodeType) {
        NodeType[NodeType["PLACEHOLDER"] = 0] = "PLACEHOLDER";
        NodeType[NodeType["ELEMENT_NODE"] = 1] = "ELEMENT_NODE";
        NodeType[NodeType["ATTRIBUTE_NODE"] = 2] = "ATTRIBUTE_NODE";
        NodeType[NodeType["TEXT_NODE"] = 3] = "TEXT_NODE";
        NodeType[NodeType["CDATA_SECTION_NODE"] = 4] = "CDATA_SECTION_NODE";
        NodeType[NodeType["ENTITY_REFERENCE_NODE"] = 5] = "ENTITY_REFERENCE_NODE";
        NodeType[NodeType["ENTITY_NODE"] = 6] = "ENTITY_NODE";
        NodeType[NodeType["PROCESSING_INSTRUCTION_NODE"] = 7] = "PROCESSING_INSTRUCTION_NODE";
        NodeType[NodeType["COMMENT_NODE"] = 8] = "COMMENT_NODE";
        NodeType[NodeType["DOCUMENT_NODE"] = 9] = "DOCUMENT_NODE";
        NodeType[NodeType["DOCUMENT_TYPE_NODE"] = 10] = "DOCUMENT_TYPE_NODE";
        NodeType[NodeType["DOCUMENT_FRAGMENT_NODE"] = 11] = "DOCUMENT_FRAGMENT_NODE";
    })(NodeType || (NodeType = {}));

    const NAMESPACES = {
        svg: 'http://www.w3.org/2000/svg',
        'xlink:href': 'http://www.w3.org/1999/xlink',
        xmlns: 'http://www.w3.org/2000/xmlns/',
    };
    const SVGTagMap = {
        altglyph: 'altGlyph',
        altglyphdef: 'altGlyphDef',
        altglyphitem: 'altGlyphItem',
        animatecolor: 'animateColor',
        animatemotion: 'animateMotion',
        animatetransform: 'animateTransform',
        clippath: 'clipPath',
        feblend: 'feBlend',
        fecolormatrix: 'feColorMatrix',
        fecomponenttransfer: 'feComponentTransfer',
        fecomposite: 'feComposite',
        feconvolvematrix: 'feConvolveMatrix',
        fediffuselighting: 'feDiffuseLighting',
        fedisplacementmap: 'feDisplacementMap',
        fedistantlight: 'feDistantLight',
        fedropshadow: 'feDropShadow',
        feflood: 'feFlood',
        fefunca: 'feFuncA',
        fefuncb: 'feFuncB',
        fefuncg: 'feFuncG',
        fefuncr: 'feFuncR',
        fegaussianblur: 'feGaussianBlur',
        feimage: 'feImage',
        femerge: 'feMerge',
        femergenode: 'feMergeNode',
        femorphology: 'feMorphology',
        feoffset: 'feOffset',
        fepointlight: 'fePointLight',
        fespecularlighting: 'feSpecularLighting',
        fespotlight: 'feSpotLight',
        fetile: 'feTile',
        feturbulence: 'feTurbulence',
        foreignobject: 'foreignObject',
        glyphref: 'glyphRef',
        lineargradient: 'linearGradient',
        radialgradient: 'radialGradient',
    };
    let createdNodeSet = null;
    function diff(oldTree, newTree, replayer, rrnodeMirror = newTree.mirror ||
        newTree.ownerDocument.mirror) {
        oldTree = diffBeforeUpdatingChildren(oldTree, newTree, replayer, rrnodeMirror);
        diffChildren(oldTree, newTree, replayer, rrnodeMirror);
        diffAfterUpdatingChildren(oldTree, newTree, replayer, rrnodeMirror);
    }
    function diffBeforeUpdatingChildren(oldTree, newTree, replayer, rrnodeMirror) {
        var _a;
        if (replayer.afterAppend && !createdNodeSet) {
            createdNodeSet = new WeakSet();
            setTimeout(() => {
                createdNodeSet = null;
            }, 0);
        }
        if (!sameNodeType(oldTree, newTree)) {
            const calibratedOldTree = createOrGetNode(newTree, replayer.mirror, rrnodeMirror);
            (_a = oldTree.parentNode) === null || _a === void 0 ? void 0 : _a.replaceChild(calibratedOldTree, oldTree);
            oldTree = calibratedOldTree;
        }
        switch (newTree.RRNodeType) {
            case NodeType$1.Document: {
                if (!nodeMatching(oldTree, newTree, replayer.mirror, rrnodeMirror)) {
                    const newMeta = rrnodeMirror.getMeta(newTree);
                    if (newMeta) {
                        replayer.mirror.removeNodeFromMap(oldTree);
                        oldTree.close();
                        oldTree.open();
                        replayer.mirror.add(oldTree, newMeta);
                        createdNodeSet === null || createdNodeSet === void 0 ? void 0 : createdNodeSet.add(oldTree);
                    }
                }
                break;
            }
            case NodeType$1.Element: {
                const oldElement = oldTree;
                const newRRElement = newTree;
                switch (newRRElement.tagName) {
                    case 'IFRAME': {
                        const oldContentDocument = oldTree
                            .contentDocument;
                        if (!oldContentDocument)
                            break;
                        diff(oldContentDocument, newTree.contentDocument, replayer, rrnodeMirror);
                        break;
                    }
                }
                if (newRRElement.shadowRoot) {
                    if (!oldElement.shadowRoot)
                        oldElement.attachShadow({ mode: 'open' });
                    diffChildren(oldElement.shadowRoot, newRRElement.shadowRoot, replayer, rrnodeMirror);
                }
                break;
            }
        }
        return oldTree;
    }
    function diffAfterUpdatingChildren(oldTree, newTree, replayer, rrnodeMirror) {
        var _a;
        switch (newTree.RRNodeType) {
            case NodeType$1.Document: {
                const scrollData = newTree.scrollData;
                scrollData && replayer.applyScroll(scrollData, true);
                break;
            }
            case NodeType$1.Element: {
                const oldElement = oldTree;
                const newRRElement = newTree;
                diffProps(oldElement, newRRElement, rrnodeMirror);
                newRRElement.scrollData &&
                    replayer.applyScroll(newRRElement.scrollData, true);
                newRRElement.inputData && replayer.applyInput(newRRElement.inputData);
                switch (newRRElement.tagName) {
                    case 'AUDIO':
                    case 'VIDEO': {
                        const oldMediaElement = oldTree;
                        const newMediaRRElement = newRRElement;
                        if (newMediaRRElement.paused !== undefined)
                            newMediaRRElement.paused
                                ? void oldMediaElement.pause()
                                : void oldMediaElement.play();
                        if (newMediaRRElement.muted !== undefined)
                            oldMediaElement.muted = newMediaRRElement.muted;
                        if (newMediaRRElement.volume !== undefined)
                            oldMediaElement.volume = newMediaRRElement.volume;
                        if (newMediaRRElement.currentTime !== undefined)
                            oldMediaElement.currentTime = newMediaRRElement.currentTime;
                        if (newMediaRRElement.playbackRate !== undefined)
                            oldMediaElement.playbackRate = newMediaRRElement.playbackRate;
                        break;
                    }
                    case 'CANVAS': {
                        const rrCanvasElement = newTree;
                        if (rrCanvasElement.rr_dataURL !== null) {
                            const image = document.createElement('img');
                            image.onload = () => {
                                const ctx = oldElement.getContext('2d');
                                if (ctx) {
                                    ctx.drawImage(image, 0, 0, image.width, image.height);
                                }
                            };
                            image.src = rrCanvasElement.rr_dataURL;
                        }
                        rrCanvasElement.canvasMutations.forEach((canvasMutation) => replayer.applyCanvas(canvasMutation.event, canvasMutation.mutation, oldTree));
                        break;
                    }
                    case 'STYLE': {
                        const styleSheet = oldElement.sheet;
                        styleSheet &&
                            newTree.rules.forEach((data) => replayer.applyStyleSheetMutation(data, styleSheet));
                        break;
                    }
                }
                break;
            }
            case NodeType$1.Text:
            case NodeType$1.Comment:
            case NodeType$1.CDATA: {
                if (oldTree.textContent !==
                    newTree.data)
                    oldTree.textContent = newTree.data;
                break;
            }
        }
        if (createdNodeSet === null || createdNodeSet === void 0 ? void 0 : createdNodeSet.has(oldTree)) {
            createdNodeSet.delete(oldTree);
            (_a = replayer.afterAppend) === null || _a === void 0 ? void 0 : _a.call(replayer, oldTree, replayer.mirror.getId(oldTree));
        }
    }
    function diffProps(oldTree, newTree, rrnodeMirror) {
        const oldAttributes = oldTree.attributes;
        const newAttributes = newTree.attributes;
        for (const name in newAttributes) {
            const newValue = newAttributes[name];
            const sn = rrnodeMirror.getMeta(newTree);
            if ((sn === null || sn === void 0 ? void 0 : sn.isSVG) && NAMESPACES[name])
                oldTree.setAttributeNS(NAMESPACES[name], name, newValue);
            else if (newTree.tagName === 'CANVAS' && name === 'rr_dataURL') {
                const image = document.createElement('img');
                image.src = newValue;
                image.onload = () => {
                    const ctx = oldTree.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(image, 0, 0, image.width, image.height);
                    }
                };
            }
            else if (newTree.tagName === 'IFRAME' && name === 'srcdoc')
                continue;
            else
                oldTree.setAttribute(name, newValue);
        }
        for (const { name } of Array.from(oldAttributes))
            if (!(name in newAttributes))
                oldTree.removeAttribute(name);
        newTree.scrollLeft && (oldTree.scrollLeft = newTree.scrollLeft);
        newTree.scrollTop && (oldTree.scrollTop = newTree.scrollTop);
    }
    function diffChildren(oldTree, newTree, replayer, rrnodeMirror) {
        const oldChildren = Array.from(oldTree.childNodes);
        const newChildren = newTree.childNodes;
        if (oldChildren.length === 0 && newChildren.length === 0)
            return;
        let oldStartIndex = 0, oldEndIndex = oldChildren.length - 1, newStartIndex = 0, newEndIndex = newChildren.length - 1;
        let oldStartNode = oldChildren[oldStartIndex], oldEndNode = oldChildren[oldEndIndex], newStartNode = newChildren[newStartIndex], newEndNode = newChildren[newEndIndex];
        let oldIdToIndex = undefined, indexInOld = undefined;
        while (oldStartIndex <= oldEndIndex && newStartIndex <= newEndIndex) {
            if (oldStartNode === undefined) {
                oldStartNode = oldChildren[++oldStartIndex];
            }
            else if (oldEndNode === undefined) {
                oldEndNode = oldChildren[--oldEndIndex];
            }
            else if (nodeMatching(oldStartNode, newStartNode, replayer.mirror, rrnodeMirror)) {
                oldStartNode = oldChildren[++oldStartIndex];
                newStartNode = newChildren[++newStartIndex];
            }
            else if (nodeMatching(oldEndNode, newEndNode, replayer.mirror, rrnodeMirror)) {
                oldEndNode = oldChildren[--oldEndIndex];
                newEndNode = newChildren[--newEndIndex];
            }
            else if (nodeMatching(oldStartNode, newEndNode, replayer.mirror, rrnodeMirror)) {
                try {
                    oldTree.insertBefore(oldStartNode, oldEndNode.nextSibling);
                }
                catch (e) {
                    console.warn(e);
                }
                oldStartNode = oldChildren[++oldStartIndex];
                newEndNode = newChildren[--newEndIndex];
            }
            else if (nodeMatching(oldEndNode, newStartNode, replayer.mirror, rrnodeMirror)) {
                try {
                    oldTree.insertBefore(oldEndNode, oldStartNode);
                }
                catch (e) {
                    console.warn(e);
                }
                oldEndNode = oldChildren[--oldEndIndex];
                newStartNode = newChildren[++newStartIndex];
            }
            else {
                if (!oldIdToIndex) {
                    oldIdToIndex = {};
                    for (let i = oldStartIndex; i <= oldEndIndex; i++) {
                        const oldChild = oldChildren[i];
                        if (oldChild && replayer.mirror.hasNode(oldChild))
                            oldIdToIndex[replayer.mirror.getId(oldChild)] = i;
                    }
                }
                indexInOld = oldIdToIndex[rrnodeMirror.getId(newStartNode)];
                const nodeToMove = oldChildren[indexInOld];
                if (indexInOld !== undefined &&
                    nodeToMove &&
                    nodeMatching(nodeToMove, newStartNode, replayer.mirror, rrnodeMirror)) {
                    try {
                        oldTree.insertBefore(nodeToMove, oldStartNode);
                    }
                    catch (e) {
                        console.warn(e);
                    }
                    oldChildren[indexInOld] = undefined;
                }
                else {
                    const newNode = createOrGetNode(newStartNode, replayer.mirror, rrnodeMirror);
                    if (oldTree.nodeName === '#document' &&
                        oldStartNode &&
                        ((newNode.nodeType === newNode.DOCUMENT_TYPE_NODE &&
                            oldStartNode.nodeType === oldStartNode.DOCUMENT_TYPE_NODE) ||
                            (newNode.nodeType === newNode.ELEMENT_NODE &&
                                oldStartNode.nodeType === oldStartNode.ELEMENT_NODE))) {
                        oldTree.removeChild(oldStartNode);
                        replayer.mirror.removeNodeFromMap(oldStartNode);
                        oldStartNode = oldChildren[++oldStartIndex];
                    }
                    try {
                        oldTree.insertBefore(newNode, oldStartNode || null);
                    }
                    catch (e) {
                        console.warn(e);
                    }
                }
                newStartNode = newChildren[++newStartIndex];
            }
        }
        if (oldStartIndex > oldEndIndex) {
            const referenceRRNode = newChildren[newEndIndex + 1];
            let referenceNode = null;
            if (referenceRRNode)
                referenceNode = replayer.mirror.getNode(rrnodeMirror.getId(referenceRRNode));
            for (; newStartIndex <= newEndIndex; ++newStartIndex) {
                const newNode = createOrGetNode(newChildren[newStartIndex], replayer.mirror, rrnodeMirror);
                try {
                    oldTree.insertBefore(newNode, referenceNode);
                }
                catch (e) {
                    console.warn(e);
                }
            }
        }
        else if (newStartIndex > newEndIndex) {
            for (; oldStartIndex <= oldEndIndex; oldStartIndex++) {
                const node = oldChildren[oldStartIndex];
                if (!node || node.parentNode !== oldTree)
                    continue;
                try {
                    oldTree.removeChild(node);
                    replayer.mirror.removeNodeFromMap(node);
                }
                catch (e) {
                    console.warn(e);
                }
            }
        }
        let oldChild = oldTree.firstChild;
        let newChild = newTree.firstChild;
        while (oldChild !== null && newChild !== null) {
            diff(oldChild, newChild, replayer, rrnodeMirror);
            oldChild = oldChild.nextSibling;
            newChild = newChild.nextSibling;
        }
    }
    function createOrGetNode(rrNode, domMirror, rrnodeMirror) {
        const nodeId = rrnodeMirror.getId(rrNode);
        const sn = rrnodeMirror.getMeta(rrNode);
        let node = null;
        if (nodeId > -1)
            node = domMirror.getNode(nodeId);
        if (node !== null && sameNodeType(node, rrNode))
            return node;
        switch (rrNode.RRNodeType) {
            case NodeType$1.Document:
                node = new Document();
                break;
            case NodeType$1.DocumentType:
                node = document.implementation.createDocumentType(rrNode.name, rrNode.publicId, rrNode.systemId);
                break;
            case NodeType$1.Element: {
                let tagName = rrNode.tagName.toLowerCase();
                tagName = SVGTagMap[tagName] || tagName;
                if (sn && 'isSVG' in sn && (sn === null || sn === void 0 ? void 0 : sn.isSVG)) {
                    node = document.createElementNS(NAMESPACES['svg'], tagName);
                }
                else
                    node = document.createElement(rrNode.tagName);
                break;
            }
            case NodeType$1.Text:
                node = document.createTextNode(rrNode.data);
                break;
            case NodeType$1.Comment:
                node = document.createComment(rrNode.data);
                break;
            case NodeType$1.CDATA:
                node = document.createCDATASection(rrNode.data);
                break;
        }
        if (sn)
            domMirror.add(node, Object.assign({}, sn));
        try {
            createdNodeSet === null || createdNodeSet === void 0 ? void 0 : createdNodeSet.add(node);
        }
        catch (e) {
        }
        return node;
    }
    function sameNodeType(node1, node2) {
        if (node1.nodeType !== node2.nodeType)
            return false;
        return (node1.nodeType !== node1.ELEMENT_NODE ||
            node1.tagName.toUpperCase() ===
                node2.tagName);
    }
    function nodeMatching(node1, node2, domMirror, rrdomMirror) {
        const node1Id = domMirror.getId(node1);
        const node2Id = rrdomMirror.getId(node2);
        if (node1Id === -1 || node1Id !== node2Id)
            return false;
        return sameNodeType(node1, node2);
    }

    class RRDocument extends BaseRRDocumentImpl(BaseRRNode) {
        get unserializedId() {
            return this._unserializedId--;
        }
        constructor(mirror) {
            super();
            this.UNSERIALIZED_STARTING_ID = -2;
            this._unserializedId = this.UNSERIALIZED_STARTING_ID;
            this.mirror = createMirror();
            this.scrollData = null;
            if (mirror) {
                this.mirror = mirror;
            }
        }
        createDocument(_namespace, _qualifiedName, _doctype) {
            return new RRDocument();
        }
        createDocumentType(qualifiedName, publicId, systemId) {
            const documentTypeNode = new RRDocumentType(qualifiedName, publicId, systemId);
            documentTypeNode.ownerDocument = this;
            return documentTypeNode;
        }
        createElement(tagName) {
            const upperTagName = tagName.toUpperCase();
            let element;
            switch (upperTagName) {
                case 'AUDIO':
                case 'VIDEO':
                    element = new RRMediaElement(upperTagName);
                    break;
                case 'IFRAME':
                    element = new RRIFrameElement(upperTagName, this.mirror);
                    break;
                case 'CANVAS':
                    element = new RRCanvasElement(upperTagName);
                    break;
                case 'STYLE':
                    element = new RRStyleElement(upperTagName);
                    break;
                default:
                    element = new RRElement(upperTagName);
                    break;
            }
            element.ownerDocument = this;
            return element;
        }
        createComment(data) {
            const commentNode = new RRComment(data);
            commentNode.ownerDocument = this;
            return commentNode;
        }
        createCDATASection(data) {
            const sectionNode = new RRCDATASection(data);
            sectionNode.ownerDocument = this;
            return sectionNode;
        }
        createTextNode(data) {
            const textNode = new RRText(data);
            textNode.ownerDocument = this;
            return textNode;
        }
        destroyTree() {
            this.firstChild = null;
            this.lastChild = null;
            this.mirror.reset();
        }
        open() {
            super.open();
            this._unserializedId = this.UNSERIALIZED_STARTING_ID;
        }
    }
    const RRDocumentType = BaseRRDocumentTypeImpl(BaseRRNode);
    class RRElement extends BaseRRElementImpl(BaseRRNode) {
        constructor() {
            super(...arguments);
            this.inputData = null;
            this.scrollData = null;
        }
    }
    class RRMediaElement extends BaseRRMediaElementImpl(RRElement) {
    }
    class RRCanvasElement extends RRElement {
        constructor() {
            super(...arguments);
            this.rr_dataURL = null;
            this.canvasMutations = [];
        }
        getContext() {
            return null;
        }
    }
    class RRStyleElement extends RRElement {
        constructor() {
            super(...arguments);
            this.rules = [];
        }
    }
    class RRIFrameElement extends RRElement {
        constructor(upperTagName, mirror) {
            super(upperTagName);
            this.contentDocument = new RRDocument();
            this.contentDocument.mirror = mirror;
        }
    }
    const RRText = BaseRRTextImpl(BaseRRNode);
    const RRComment = BaseRRCommentImpl(BaseRRNode);
    const RRCDATASection = BaseRRCDATASectionImpl(BaseRRNode);
    function getValidTagName(element) {
        if (element instanceof HTMLFormElement) {
            return 'FORM';
        }
        return element.tagName.toUpperCase();
    }
    function buildFromNode(node, rrdom, domMirror, parentRRNode) {
        let rrNode;
        switch (node.nodeType) {
            case NodeType.DOCUMENT_NODE:
                if (parentRRNode && parentRRNode.nodeName === 'IFRAME')
                    rrNode = parentRRNode.contentDocument;
                else {
                    rrNode = rrdom;
                    rrNode.compatMode = node.compatMode;
                }
                break;
            case NodeType.DOCUMENT_TYPE_NODE: {
                const documentType = node;
                rrNode = rrdom.createDocumentType(documentType.name, documentType.publicId, documentType.systemId);
                break;
            }
            case NodeType.ELEMENT_NODE: {
                const elementNode = node;
                const tagName = getValidTagName(elementNode);
                rrNode = rrdom.createElement(tagName);
                const rrElement = rrNode;
                for (const { name, value } of Array.from(elementNode.attributes)) {
                    rrElement.attributes[name] = value;
                }
                elementNode.scrollLeft && (rrElement.scrollLeft = elementNode.scrollLeft);
                elementNode.scrollTop && (rrElement.scrollTop = elementNode.scrollTop);
                break;
            }
            case NodeType.TEXT_NODE:
                rrNode = rrdom.createTextNode(node.textContent || '');
                break;
            case NodeType.CDATA_SECTION_NODE:
                rrNode = rrdom.createCDATASection(node.data);
                break;
            case NodeType.COMMENT_NODE:
                rrNode = rrdom.createComment(node.textContent || '');
                break;
            case NodeType.DOCUMENT_FRAGMENT_NODE:
                rrNode = parentRRNode.attachShadow({ mode: 'open' });
                break;
            default:
                return null;
        }
        let sn = domMirror.getMeta(node);
        if (rrdom instanceof RRDocument) {
            if (!sn) {
                sn = getDefaultSN(rrNode, rrdom.unserializedId);
                domMirror.add(node, sn);
            }
            rrdom.mirror.add(rrNode, Object.assign({}, sn));
        }
        return rrNode;
    }
    function buildFromDom(dom, domMirror = createMirror$1(), rrdom = new RRDocument()) {
        function walk(node, parentRRNode) {
            const rrNode = buildFromNode(node, rrdom, domMirror, parentRRNode);
            if (rrNode === null)
                return;
            if ((parentRRNode === null || parentRRNode === void 0 ? void 0 : parentRRNode.nodeName) !== 'IFRAME' &&
                node.nodeType !== NodeType.DOCUMENT_FRAGMENT_NODE) {
                parentRRNode === null || parentRRNode === void 0 ? void 0 : parentRRNode.appendChild(rrNode);
                rrNode.parentNode = parentRRNode;
                rrNode.parentElement = parentRRNode;
            }
            if (node.nodeName === 'IFRAME') {
                const iframeDoc = node.contentDocument;
                iframeDoc && walk(iframeDoc, rrNode);
            }
            else if (node.nodeType === NodeType.DOCUMENT_NODE ||
                node.nodeType === NodeType.ELEMENT_NODE ||
                node.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE) {
                if (node.nodeType === NodeType.ELEMENT_NODE &&
                    node.shadowRoot)
                    walk(node.shadowRoot, rrNode);
                node.childNodes.forEach((childNode) => walk(childNode, rrNode));
            }
        }
        walk(dom, null);
        return rrdom;
    }
    function createMirror() {
        return new Mirror();
    }
    class Mirror {
        constructor() {
            this.idNodeMap = new Map();
            this.nodeMetaMap = new WeakMap();
        }
        getId(n) {
            var _a;
            if (!n)
                return -1;
            const id = (_a = this.getMeta(n)) === null || _a === void 0 ? void 0 : _a.id;
            return id !== null && id !== void 0 ? id : -1;
        }
        getNode(id) {
            return this.idNodeMap.get(id) || null;
        }
        getIds() {
            return Array.from(this.idNodeMap.keys());
        }
        getMeta(n) {
            return this.nodeMetaMap.get(n) || null;
        }
        removeNodeFromMap(n) {
            const id = this.getId(n);
            this.idNodeMap.delete(id);
            if (n.childNodes) {
                n.childNodes.forEach((childNode) => this.removeNodeFromMap(childNode));
            }
        }
        has(id) {
            return this.idNodeMap.has(id);
        }
        hasNode(node) {
            return this.nodeMetaMap.has(node);
        }
        add(n, meta) {
            const id = meta.id;
            this.idNodeMap.set(id, n);
            this.nodeMetaMap.set(n, meta);
        }
        replace(id, n) {
            const oldNode = this.getNode(id);
            if (oldNode) {
                const meta = this.nodeMetaMap.get(oldNode);
                if (meta)
                    this.nodeMetaMap.set(n, meta);
            }
            this.idNodeMap.set(id, n);
        }
        reset() {
            this.idNodeMap = new Map();
            this.nodeMetaMap = new WeakMap();
        }
    }
    function getDefaultSN(node, id) {
        switch (node.RRNodeType) {
            case NodeType$1.Document:
                return {
                    id,
                    type: node.RRNodeType,
                    childNodes: [],
                };
            case NodeType$1.DocumentType: {
                const doctype = node;
                return {
                    id,
                    type: node.RRNodeType,
                    name: doctype.name,
                    publicId: doctype.publicId,
                    systemId: doctype.systemId,
                };
            }
            case NodeType$1.Element:
                return {
                    id,
                    type: node.RRNodeType,
                    tagName: node.tagName.toLowerCase(),
                    attributes: {},
                    childNodes: [],
                };
            case NodeType$1.Text:
                return {
                    id,
                    type: node.RRNodeType,
                    textContent: node.textContent || '',
                };
            case NodeType$1.Comment:
                return {
                    id,
                    type: node.RRNodeType,
                    textContent: node.textContent || '',
                };
            case NodeType$1.CDATA:
                return {
                    id,
                    type: node.RRNodeType,
                    textContent: '',
                };
        }
    }

    // DEFLATE is a complex format; to read this code, you should probably check the RFC first:

    // aliases for shorter compressed code (most minifers don't do this)
    var u8 = Uint8Array, u16 = Uint16Array, u32 = Uint32Array;
    // fixed length extra bits
    var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0]);
    // fixed distance extra bits
    // see fleb note
    var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0]);
    // code length index map
    var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
    // get base, reverse index map from extra bits
    var freb = function (eb, start) {
        var b = new u16(31);
        for (var i = 0; i < 31; ++i) {
            b[i] = start += 1 << eb[i - 1];
        }
        // numbers here are at max 18 bits
        var r = new u32(b[30]);
        for (var i = 1; i < 30; ++i) {
            for (var j = b[i]; j < b[i + 1]; ++j) {
                r[j] = ((j - b[i]) << 5) | i;
            }
        }
        return [b, r];
    };
    var _a = freb(fleb, 2), fl = _a[0], revfl = _a[1];
    // we can ignore the fact that the other numbers are wrong; they never happen anyway
    fl[28] = 258, revfl[258] = 28;
    var _b = freb(fdeb, 0), fd = _b[0];
    // map of value to reverse (assuming 16 bits)
    var rev = new u16(32768);
    for (var i$1 = 0; i$1 < 32768; ++i$1) {
        // reverse table algorithm from SO
        var x = ((i$1 & 0xAAAA) >>> 1) | ((i$1 & 0x5555) << 1);
        x = ((x & 0xCCCC) >>> 2) | ((x & 0x3333) << 2);
        x = ((x & 0xF0F0) >>> 4) | ((x & 0x0F0F) << 4);
        rev[i$1] = (((x & 0xFF00) >>> 8) | ((x & 0x00FF) << 8)) >>> 1;
    }
    // create huffman tree from u8 "map": index -> code length for code index
    // mb (max bits) must be at most 15
    // TODO: optimize/split up?
    var hMap = (function (cd, mb, r) {
        var s = cd.length;
        // index
        var i = 0;
        // u16 "map": index -> # of codes with bit length = index
        var l = new u16(mb);
        // length of cd must be 288 (total # of codes)
        for (; i < s; ++i)
            ++l[cd[i] - 1];
        // u16 "map": index -> minimum code for bit length = index
        var le = new u16(mb);
        for (i = 0; i < mb; ++i) {
            le[i] = (le[i - 1] + l[i - 1]) << 1;
        }
        var co;
        if (r) {
            // u16 "map": index -> number of actual bits, symbol for code
            co = new u16(1 << mb);
            // bits to remove for reverser
            var rvb = 15 - mb;
            for (i = 0; i < s; ++i) {
                // ignore 0 lengths
                if (cd[i]) {
                    // num encoding both symbol and bits read
                    var sv = (i << 4) | cd[i];
                    // free bits
                    var r_1 = mb - cd[i];
                    // start value
                    var v = le[cd[i] - 1]++ << r_1;
                    // m is end value
                    for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
                        // every 16 bit value starting with the code yields the same result
                        co[rev[v] >>> rvb] = sv;
                    }
                }
            }
        }
        else {
            co = new u16(s);
            for (i = 0; i < s; ++i)
                co[i] = rev[le[cd[i] - 1]++] >>> (15 - cd[i]);
        }
        return co;
    });
    // fixed length tree
    var flt = new u8(288);
    for (var i$1 = 0; i$1 < 144; ++i$1)
        flt[i$1] = 8;
    for (var i$1 = 144; i$1 < 256; ++i$1)
        flt[i$1] = 9;
    for (var i$1 = 256; i$1 < 280; ++i$1)
        flt[i$1] = 7;
    for (var i$1 = 280; i$1 < 288; ++i$1)
        flt[i$1] = 8;
    // fixed distance tree
    var fdt = new u8(32);
    for (var i$1 = 0; i$1 < 32; ++i$1)
        fdt[i$1] = 5;
    // fixed length map
    var flrm = /*#__PURE__*/ hMap(flt, 9, 1);
    // fixed distance map
    var fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
    // find max of array
    var max = function (a) {
        var m = a[0];
        for (var i = 1; i < a.length; ++i) {
            if (a[i] > m)
                m = a[i];
        }
        return m;
    };
    // read d, starting at bit p and mask with m
    var bits = function (d, p, m) {
        var o = (p / 8) >> 0;
        return ((d[o] | (d[o + 1] << 8)) >>> (p & 7)) & m;
    };
    // read d, starting at bit p continuing for at least 16 bits
    var bits16 = function (d, p) {
        var o = (p / 8) >> 0;
        return ((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >>> (p & 7));
    };
    // get end of byte
    var shft = function (p) { return ((p / 8) >> 0) + (p & 7 && 1); };
    // typed array slice - allows garbage collector to free original reference,
    // while being more compatible than .slice
    var slc = function (v, s, e) {
        if (s == null || s < 0)
            s = 0;
        if (e == null || e > v.length)
            e = v.length;
        // can't use .constructor in case user-supplied
        var n = new (v instanceof u16 ? u16 : v instanceof u32 ? u32 : u8)(e - s);
        n.set(v.subarray(s, e));
        return n;
    };
    // expands raw DEFLATE data
    var inflt = function (dat, buf, st) {
        // source length
        var sl = dat.length;
        // have to estimate size
        var noBuf = !buf || st;
        // no state
        var noSt = !st || st.i;
        if (!st)
            st = {};
        // Assumes roughly 33% compression ratio average
        if (!buf)
            buf = new u8(sl * 3);
        // ensure buffer can fit at least l elements
        var cbuf = function (l) {
            var bl = buf.length;
            // need to increase size to fit
            if (l > bl) {
                // Double or set to necessary, whichever is greater
                var nbuf = new u8(Math.max(bl * 2, l));
                nbuf.set(buf);
                buf = nbuf;
            }
        };
        //  last chunk         bitpos           bytes
        var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
        // total bits
        var tbts = sl * 8;
        do {
            if (!lm) {
                // BFINAL - this is only 1 when last chunk is next
                st.f = final = bits(dat, pos, 1);
                // type: 0 = no compression, 1 = fixed huffman, 2 = dynamic huffman
                var type = bits(dat, pos + 1, 3);
                pos += 3;
                if (!type) {
                    // go to end of byte boundary
                    var s = shft(pos) + 4, l = dat[s - 4] | (dat[s - 3] << 8), t = s + l;
                    if (t > sl) {
                        if (noSt)
                            throw 'unexpected EOF';
                        break;
                    }
                    // ensure size
                    if (noBuf)
                        cbuf(bt + l);
                    // Copy over uncompressed data
                    buf.set(dat.subarray(s, t), bt);
                    // Get new bitpos, update byte count
                    st.b = bt += l, st.p = pos = t * 8;
                    continue;
                }
                else if (type == 1)
                    lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
                else if (type == 2) {
                    //  literal                            lengths
                    var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
                    var tl = hLit + bits(dat, pos + 5, 31) + 1;
                    pos += 14;
                    // length+distance tree
                    var ldt = new u8(tl);
                    // code length tree
                    var clt = new u8(19);
                    for (var i = 0; i < hcLen; ++i) {
                        // use index map to get real code
                        clt[clim[i]] = bits(dat, pos + i * 3, 7);
                    }
                    pos += hcLen * 3;
                    // code lengths bits
                    var clb = max(clt), clbmsk = (1 << clb) - 1;
                    if (!noSt && pos + tl * (clb + 7) > tbts)
                        break;
                    // code lengths map
                    var clm = hMap(clt, clb, 1);
                    for (var i = 0; i < tl;) {
                        var r = clm[bits(dat, pos, clbmsk)];
                        // bits read
                        pos += r & 15;
                        // symbol
                        var s = r >>> 4;
                        // code length to copy
                        if (s < 16) {
                            ldt[i++] = s;
                        }
                        else {
                            //  copy   count
                            var c = 0, n = 0;
                            if (s == 16)
                                n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
                            else if (s == 17)
                                n = 3 + bits(dat, pos, 7), pos += 3;
                            else if (s == 18)
                                n = 11 + bits(dat, pos, 127), pos += 7;
                            while (n--)
                                ldt[i++] = c;
                        }
                    }
                    //    length tree                 distance tree
                    var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
                    // max length bits
                    lbt = max(lt);
                    // max dist bits
                    dbt = max(dt);
                    lm = hMap(lt, lbt, 1);
                    dm = hMap(dt, dbt, 1);
                }
                else
                    throw 'invalid block type';
                if (pos > tbts)
                    throw 'unexpected EOF';
            }
            // Make sure the buffer can hold this + the largest possible addition
            // Maximum chunk size (practically, theoretically infinite) is 2^17;
            if (noBuf)
                cbuf(bt + 131072);
            var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
            var mxa = lbt + dbt + 18;
            while (noSt || pos + mxa < tbts) {
                // bits read, code
                var c = lm[bits16(dat, pos) & lms], sym = c >>> 4;
                pos += c & 15;
                if (pos > tbts)
                    throw 'unexpected EOF';
                if (!c)
                    throw 'invalid length/literal';
                if (sym < 256)
                    buf[bt++] = sym;
                else if (sym == 256) {
                    lm = null;
                    break;
                }
                else {
                    var add = sym - 254;
                    // no extra bits needed if less
                    if (sym > 264) {
                        // index
                        var i = sym - 257, b = fleb[i];
                        add = bits(dat, pos, (1 << b) - 1) + fl[i];
                        pos += b;
                    }
                    // dist
                    var d = dm[bits16(dat, pos) & dms], dsym = d >>> 4;
                    if (!d)
                        throw 'invalid distance';
                    pos += d & 15;
                    var dt = fd[dsym];
                    if (dsym > 3) {
                        var b = fdeb[dsym];
                        dt += bits16(dat, pos) & ((1 << b) - 1), pos += b;
                    }
                    if (pos > tbts)
                        throw 'unexpected EOF';
                    if (noBuf)
                        cbuf(bt + 131072);
                    var end = bt + add;
                    for (; bt < end; bt += 4) {
                        buf[bt] = buf[bt - dt];
                        buf[bt + 1] = buf[bt + 1 - dt];
                        buf[bt + 2] = buf[bt + 2 - dt];
                        buf[bt + 3] = buf[bt + 3 - dt];
                    }
                    bt = end;
                }
            }
            st.l = lm, st.p = pos, st.b = bt;
            if (lm)
                final = 1, st.m = lbt, st.d = dm, st.n = dbt;
        } while (!final);
        return bt == buf.length ? buf : slc(buf, 0, bt);
    };
    // zlib valid
    var zlv = function (d) {
        if ((d[0] & 15) != 8 || (d[0] >>> 4) > 7 || ((d[0] << 8 | d[1]) % 31))
            throw 'invalid zlib data';
        if (d[1] & 32)
            throw 'invalid zlib data: preset dictionaries not supported';
    };
    /**
     * Expands Zlib data
     * @param data The data to decompress
     * @param out Where to write the data. Saves memory if you know the decompressed size and provide an output buffer of that length.
     * @returns The decompressed version of the data
     */
    function unzlibSync(data, out) {
        return inflt((zlv(data), data.subarray(2, -4)), out);
    }
    /**
     * Converts a string into a Uint8Array for use with compression/decompression methods
     * @param str The string to encode
     * @param latin1 Whether or not to interpret the data as Latin-1. This should
     *               not need to be true unless decoding a binary string.
     * @returns The string encoded in UTF-8/Latin-1 binary
     */
    function strToU8(str, latin1) {
        var l = str.length;
        if (!latin1 && typeof TextEncoder != 'undefined')
            return new TextEncoder().encode(str);
        var ar = new u8(str.length + (str.length >>> 1));
        var ai = 0;
        var w = function (v) { ar[ai++] = v; };
        for (var i = 0; i < l; ++i) {
            if (ai + 5 > ar.length) {
                var n = new u8(ai + 8 + ((l - i) << 1));
                n.set(ar);
                ar = n;
            }
            var c = str.charCodeAt(i);
            if (c < 128 || latin1)
                w(c);
            else if (c < 2048)
                w(192 | (c >>> 6)), w(128 | (c & 63));
            else if (c > 55295 && c < 57344)
                c = 65536 + (c & 1023 << 10) | (str.charCodeAt(++i) & 1023),
                    w(240 | (c >>> 18)), w(128 | ((c >>> 12) & 63)), w(128 | ((c >>> 6) & 63)), w(128 | (c & 63));
            else
                w(224 | (c >>> 12)), w(128 | ((c >>> 6) & 63)), w(128 | (c & 63));
        }
        return slc(ar, 0, ai);
    }
    /**
     * Converts a Uint8Array to a string
     * @param dat The data to decode to string
     * @param latin1 Whether or not to interpret the data as Latin-1. This should
     *               not need to be true unless encoding to binary string.
     * @returns The original UTF-8/Latin-1 string
     */
    function strFromU8(dat, latin1) {
        var r = '';
        if (!latin1 && typeof TextDecoder != 'undefined')
            return new TextDecoder().decode(dat);
        for (var i = 0; i < dat.length;) {
            var c = dat[i++];
            if (c < 128 || latin1)
                r += String.fromCharCode(c);
            else if (c < 224)
                r += String.fromCharCode((c & 31) << 6 | (dat[i++] & 63));
            else if (c < 240)
                r += String.fromCharCode((c & 15) << 12 | (dat[i++] & 63) << 6 | (dat[i++] & 63));
            else
                c = ((c & 15) << 18 | (dat[i++] & 63) << 12 | (dat[i++] & 63) << 6 | (dat[i++] & 63)) - 65536,
                    r += String.fromCharCode(55296 | (c >> 10), 56320 | (c & 1023));
        }
        return r;
    }

    const MARK = 'v1';

    const unpack = (raw) => {
        if (typeof raw !== 'string') {
            return raw;
        }
        try {
            const e = JSON.parse(raw);
            if (e.timestamp) {
                return e;
            }
        }
        catch (error) {
        }
        try {
            const e = JSON.parse(strFromU8(unzlibSync(strToU8(raw, true))));
            if (e.v === MARK) {
                return e;
            }
            throw new Error(`These events were packed with packer ${e.v} which is incompatible with current packer ${MARK}.`);
        }
        catch (error) {
            console.error(error);
            throw new Error('Unknown data format.');
        }
    };

    function mitt$1(n){return {all:n=n||new Map,on:function(t,e){var i=n.get(t);i?i.push(e):n.set(t,[e]);},off:function(t,e){var i=n.get(t);i&&(e?i.splice(i.indexOf(e)>>>0,1):n.set(t,[]));},emit:function(t,e){var i=n.get(t);i&&i.slice().map(function(n){n(e);}),(i=n.get("*"))&&i.slice().map(function(n){n(t,e);});}}}

    var mitt$1$1 = /*#__PURE__*/Object.freeze({
        __proto__: null,
        'default': mitt$1
    });

    function polyfill(w = window, d = document) {
        if ('scrollBehavior' in d.documentElement.style &&
            w.__forceSmoothScrollPolyfill__ !== true) {
            return;
        }
        const Element = w.HTMLElement || w.Element;
        const SCROLL_TIME = 468;
        const original = {
            scroll: w.scroll || w.scrollTo,
            scrollBy: w.scrollBy,
            elementScroll: Element.prototype.scroll || scrollElement,
            scrollIntoView: Element.prototype.scrollIntoView,
        };
        const now = w.performance && w.performance.now
            ? w.performance.now.bind(w.performance)
            : Date.now;
        function isMicrosoftBrowser(userAgent) {
            const userAgentPatterns = ['MSIE ', 'Trident/', 'Edge/'];
            return new RegExp(userAgentPatterns.join('|')).test(userAgent);
        }
        const ROUNDING_TOLERANCE = isMicrosoftBrowser(w.navigator.userAgent) ? 1 : 0;
        function scrollElement(x, y) {
            this.scrollLeft = x;
            this.scrollTop = y;
        }
        function ease(k) {
            return 0.5 * (1 - Math.cos(Math.PI * k));
        }
        function shouldBailOut(firstArg) {
            if (firstArg === null ||
                typeof firstArg !== 'object' ||
                firstArg.behavior === undefined ||
                firstArg.behavior === 'auto' ||
                firstArg.behavior === 'instant') {
                return true;
            }
            if (typeof firstArg === 'object' && firstArg.behavior === 'smooth') {
                return false;
            }
            throw new TypeError('behavior member of ScrollOptions ' +
                firstArg.behavior +
                ' is not a valid value for enumeration ScrollBehavior.');
        }
        function hasScrollableSpace(el, axis) {
            if (axis === 'Y') {
                return el.clientHeight + ROUNDING_TOLERANCE < el.scrollHeight;
            }
            if (axis === 'X') {
                return el.clientWidth + ROUNDING_TOLERANCE < el.scrollWidth;
            }
        }
        function canOverflow(el, axis) {
            const overflowValue = w.getComputedStyle(el, null)['overflow' + axis];
            return overflowValue === 'auto' || overflowValue === 'scroll';
        }
        function isScrollable(el) {
            const isScrollableY = hasScrollableSpace(el, 'Y') && canOverflow(el, 'Y');
            const isScrollableX = hasScrollableSpace(el, 'X') && canOverflow(el, 'X');
            return isScrollableY || isScrollableX;
        }
        function findScrollableParent(el) {
            while (el !== d.body && isScrollable(el) === false) {
                el = el.parentNode || el.host;
            }
            return el;
        }
        function step(context) {
            const time = now();
            let value;
            let currentX;
            let currentY;
            let elapsed = (time - context.startTime) / SCROLL_TIME;
            elapsed = elapsed > 1 ? 1 : elapsed;
            value = ease(elapsed);
            currentX = context.startX + (context.x - context.startX) * value;
            currentY = context.startY + (context.y - context.startY) * value;
            context.method.call(context.scrollable, currentX, currentY);
            if (currentX !== context.x || currentY !== context.y) {
                w.requestAnimationFrame(step.bind(w, context));
            }
        }
        function smoothScroll(el, x, y) {
            let scrollable;
            let startX;
            let startY;
            let method;
            const startTime = now();
            if (el === d.body) {
                scrollable = w;
                startX = w.scrollX || w.pageXOffset;
                startY = w.scrollY || w.pageYOffset;
                method = original.scroll;
            }
            else {
                scrollable = el;
                startX = el.scrollLeft;
                startY = el.scrollTop;
                method = scrollElement;
            }
            step({
                scrollable: scrollable,
                method: method,
                startTime: startTime,
                startX: startX,
                startY: startY,
                x: x,
                y: y,
            });
        }
        w.scroll = w.scrollTo = function () {
            if (arguments[0] === undefined) {
                return;
            }
            if (shouldBailOut(arguments[0]) === true) {
                original.scroll.call(w, arguments[0].left !== undefined
                    ? arguments[0].left
                    : typeof arguments[0] !== 'object'
                        ? arguments[0]
                        : w.scrollX || w.pageXOffset, arguments[0].top !== undefined
                    ? arguments[0].top
                    : arguments[1] !== undefined
                        ? arguments[1]
                        : w.scrollY || w.pageYOffset);
                return;
            }
            smoothScroll.call(w, d.body, arguments[0].left !== undefined
                ? ~~arguments[0].left
                : w.scrollX || w.pageXOffset, arguments[0].top !== undefined
                ? ~~arguments[0].top
                : w.scrollY || w.pageYOffset);
        };
        w.scrollBy = function () {
            if (arguments[0] === undefined) {
                return;
            }
            if (shouldBailOut(arguments[0])) {
                original.scrollBy.call(w, arguments[0].left !== undefined
                    ? arguments[0].left
                    : typeof arguments[0] !== 'object'
                        ? arguments[0]
                        : 0, arguments[0].top !== undefined
                    ? arguments[0].top
                    : arguments[1] !== undefined
                        ? arguments[1]
                        : 0);
                return;
            }
            smoothScroll.call(w, d.body, ~~arguments[0].left + (w.scrollX || w.pageXOffset), ~~arguments[0].top + (w.scrollY || w.pageYOffset));
        };
        Element.prototype.scroll = Element.prototype.scrollTo = function () {
            if (arguments[0] === undefined) {
                return;
            }
            if (shouldBailOut(arguments[0]) === true) {
                if (typeof arguments[0] === 'number' && arguments[1] === undefined) {
                    throw new SyntaxError('Value could not be converted');
                }
                original.elementScroll.call(this, arguments[0].left !== undefined
                    ? ~~arguments[0].left
                    : typeof arguments[0] !== 'object'
                        ? ~~arguments[0]
                        : this.scrollLeft, arguments[0].top !== undefined
                    ? ~~arguments[0].top
                    : arguments[1] !== undefined
                        ? ~~arguments[1]
                        : this.scrollTop);
                return;
            }
            const left = arguments[0].left;
            const top = arguments[0].top;
            smoothScroll.call(this, this, typeof left === 'undefined' ? this.scrollLeft : ~~left, typeof top === 'undefined' ? this.scrollTop : ~~top);
        };
        Element.prototype.scrollBy = function () {
            if (arguments[0] === undefined) {
                return;
            }
            if (shouldBailOut(arguments[0]) === true) {
                original.elementScroll.call(this, arguments[0].left !== undefined
                    ? ~~arguments[0].left + this.scrollLeft
                    : ~~arguments[0] + this.scrollLeft, arguments[0].top !== undefined
                    ? ~~arguments[0].top + this.scrollTop
                    : ~~arguments[1] + this.scrollTop);
                return;
            }
            this.scroll({
                left: ~~arguments[0].left + this.scrollLeft,
                top: ~~arguments[0].top + this.scrollTop,
                behavior: arguments[0].behavior,
            });
        };
        Element.prototype.scrollIntoView = function () {
            if (shouldBailOut(arguments[0]) === true) {
                original.scrollIntoView.call(this, arguments[0] === undefined ? true : arguments[0]);
                return;
            }
            const scrollableParent = findScrollableParent(this);
            const parentRects = scrollableParent.getBoundingClientRect();
            const clientRects = this.getBoundingClientRect();
            if (scrollableParent !== d.body) {
                smoothScroll.call(this, scrollableParent, scrollableParent.scrollLeft + clientRects.left - parentRects.left, scrollableParent.scrollTop + clientRects.top - parentRects.top);
                if (w.getComputedStyle(scrollableParent).position !== 'fixed') {
                    w.scrollBy({
                        left: parentRects.left,
                        top: parentRects.top,
                        behavior: 'smooth',
                    });
                }
            }
            else {
                w.scrollBy({
                    left: clientRects.left,
                    top: clientRects.top,
                    behavior: 'smooth',
                });
            }
        };
    }

    class Timer {
        constructor(actions = [], config) {
            this.timeOffset = 0;
            this.raf = null;
            this.actions = actions;
            this.speed = config.speed;
        }
        addAction(action) {
            const rafWasActive = this.raf === true;
            if (!this.actions.length ||
                this.actions[this.actions.length - 1].delay <= action.delay) {
                this.actions.push(action);
            }
            else {
                const index = this.findActionIndex(action);
                this.actions.splice(index, 0, action);
            }
            if (rafWasActive) {
                this.raf = requestAnimationFrame(this.rafCheck.bind(this));
            }
        }
        start() {
            this.timeOffset = 0;
            this.lastTimestamp = performance.now();
            this.raf = requestAnimationFrame(this.rafCheck.bind(this));
        }
        rafCheck() {
            const time = performance.now();
            this.timeOffset += (time - this.lastTimestamp) * this.speed;
            this.lastTimestamp = time;
            while (this.actions.length) {
                const action = this.actions[0];
                if (this.timeOffset >= action.delay) {
                    this.actions.shift();
                    action.doAction();
                }
                else {
                    break;
                }
            }
            if (this.actions.length > 0) {
                this.raf = requestAnimationFrame(this.rafCheck.bind(this));
            }
            else {
                this.raf = true;
            }
        }
        clear() {
            if (this.raf) {
                if (this.raf !== true) {
                    cancelAnimationFrame(this.raf);
                }
                this.raf = null;
            }
            this.actions.length = 0;
        }
        setSpeed(speed) {
            this.speed = speed;
        }
        isActive() {
            return this.raf !== null;
        }
        findActionIndex(action) {
            let start = 0;
            let end = this.actions.length - 1;
            while (start <= end) {
                const mid = Math.floor((start + end) / 2);
                if (this.actions[mid].delay < action.delay) {
                    start = mid + 1;
                }
                else if (this.actions[mid].delay > action.delay) {
                    end = mid - 1;
                }
                else {
                    return mid + 1;
                }
            }
            return start;
        }
    }
    function addDelay(event, baselineTime) {
        if (event.type === EventType.IncrementalSnapshot &&
            event.data.source === IncrementalSource.MouseMove &&
            event.data.positions &&
            event.data.positions.length) {
            const firstOffset = event.data.positions[0].timeOffset;
            const firstTimestamp = event.timestamp + firstOffset;
            event.delay = firstTimestamp - baselineTime;
            return firstTimestamp - baselineTime;
        }
        event.delay = event.timestamp - baselineTime;
        return event.delay;
    }

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */
    function t(t,n){var e="function"==typeof Symbol&&t[Symbol.iterator];if(!e)return t;var r,o,i=e.call(t),a=[];try{for(;(void 0===n||n-- >0)&&!(r=i.next()).done;)a.push(r.value);}catch(t){o={error:t};}finally{try{r&&!r.done&&(e=i.return)&&e.call(i);}finally{if(o)throw o.error}}return a}var n;!function(t){t[t.NotStarted=0]="NotStarted",t[t.Running=1]="Running",t[t.Stopped=2]="Stopped";}(n||(n={}));var e={type:"xstate.init"};function r(t){return void 0===t?[]:[].concat(t)}function o(t){return {type:"xstate.assign",assignment:t}}function i(t,n){return "string"==typeof(t="string"==typeof t&&n&&n[t]?n[t]:t)?{type:t}:"function"==typeof t?{type:t.name,exec:t}:t}function a(t){return function(n){return t===n}}function u(t){return "string"==typeof t?{type:t}:t}function c(t,n){return {value:t,context:n,actions:[],changed:!1,matches:a(t)}}function f(t,n,e){var r=n,o=!1;return [t.filter((function(t){if("xstate.assign"===t.type){o=!0;var n=Object.assign({},r);return "function"==typeof t.assignment?n=t.assignment(r,e):Object.keys(t.assignment).forEach((function(o){n[o]="function"==typeof t.assignment[o]?t.assignment[o](r,e):t.assignment[o];})),r=n,!1}return !0})),r,o]}function s(n,o){void 0===o&&(o={});var s=t(f(r(n.states[n.initial].entry).map((function(t){return i(t,o.actions)})),n.context,e),2),l=s[0],v=s[1],y={config:n,_options:o,initialState:{value:n.initial,actions:l,context:v,matches:a(n.initial)},transition:function(e,o){var s,l,v="string"==typeof e?{value:e,context:n.context}:e,p=v.value,g=v.context,d=u(o),x=n.states[p];if(x.on){var m=r(x.on[d.type]);try{for(var h=function(t){var n="function"==typeof Symbol&&Symbol.iterator,e=n&&t[n],r=0;if(e)return e.call(t);if(t&&"number"==typeof t.length)return {next:function(){return t&&r>=t.length&&(t=void 0),{value:t&&t[r++],done:!t}}};throw new TypeError(n?"Object is not iterable.":"Symbol.iterator is not defined.")}(m),b=h.next();!b.done;b=h.next()){var S=b.value;if(void 0===S)return c(p,g);var w="string"==typeof S?{target:S}:S,j=w.target,E=w.actions,R=void 0===E?[]:E,N=w.cond,O=void 0===N?function(){return !0}:N,_=void 0===j,k=null!=j?j:p,T=n.states[k];if(O(g,d)){var q=t(f((_?r(R):[].concat(x.exit,R,T.entry).filter((function(t){return t}))).map((function(t){return i(t,y._options.actions)})),g,d),3),z=q[0],A=q[1],B=q[2],C=null!=j?j:p;return {value:C,context:A,actions:z,changed:j!==p||z.length>0||B,matches:a(C)}}}}catch(t){s={error:t};}finally{try{b&&!b.done&&(l=h.return)&&l.call(h);}finally{if(s)throw s.error}}}return c(p,g)}};return y}var l=function(t,n){return t.actions.forEach((function(e){var r=e.exec;return r&&r(t.context,n)}))};function v(t){var r=t.initialState,o=n.NotStarted,i=new Set,c={_machine:t,send:function(e){o===n.Running&&(r=t.transition(r,e),l(r,u(e)),i.forEach((function(t){return t(r)})));},subscribe:function(t){return i.add(t),t(r),{unsubscribe:function(){return i.delete(t)}}},start:function(i){if(i){var u="object"==typeof i?i:{context:t.config.context,value:i};r={value:u.value,actions:[],context:u.context,matches:a(u.value)};}return o=n.Running,l(r,e),c},stop:function(){return o=n.Stopped,i.clear(),c},get state(){return r},get status(){return o}};return c}

    function discardPriorSnapshots(events, baselineTime) {
        for (let idx = events.length - 1; idx >= 0; idx--) {
            const event = events[idx];
            if (event.type === EventType.Meta) {
                if (event.timestamp <= baselineTime) {
                    return events.slice(idx);
                }
            }
        }
        return events;
    }
    function createPlayerService(context, { getCastFn, applyEventsSynchronously, emitter }) {
        const playerMachine = s({
            id: 'player',
            context,
            initial: 'paused',
            states: {
                playing: {
                    on: {
                        PAUSE: {
                            target: 'paused',
                            actions: ['pause'],
                        },
                        CAST_EVENT: {
                            target: 'playing',
                            actions: 'castEvent',
                        },
                        END: {
                            target: 'paused',
                            actions: ['resetLastPlayedEvent', 'pause'],
                        },
                        ADD_EVENT: {
                            target: 'playing',
                            actions: ['addEvent'],
                        },
                    },
                },
                paused: {
                    on: {
                        PLAY: {
                            target: 'playing',
                            actions: ['recordTimeOffset', 'play'],
                        },
                        CAST_EVENT: {
                            target: 'paused',
                            actions: 'castEvent',
                        },
                        TO_LIVE: {
                            target: 'live',
                            actions: ['startLive'],
                        },
                        ADD_EVENT: {
                            target: 'paused',
                            actions: ['addEvent'],
                        },
                    },
                },
                live: {
                    on: {
                        ADD_EVENT: {
                            target: 'live',
                            actions: ['addEvent'],
                        },
                        CAST_EVENT: {
                            target: 'live',
                            actions: ['castEvent'],
                        },
                    },
                },
            },
        }, {
            actions: {
                castEvent: o({
                    lastPlayedEvent: (ctx, event) => {
                        if (event.type === 'CAST_EVENT') {
                            return event.payload.event;
                        }
                        return ctx.lastPlayedEvent;
                    },
                }),
                recordTimeOffset: o((ctx, event) => {
                    let timeOffset = ctx.timeOffset;
                    if ('payload' in event && 'timeOffset' in event.payload) {
                        timeOffset = event.payload.timeOffset;
                    }
                    return Object.assign(Object.assign({}, ctx), { timeOffset, baselineTime: ctx.events[0].timestamp + timeOffset });
                }),
                play(ctx) {
                    var _a;
                    const { timer, events, baselineTime, lastPlayedEvent } = ctx;
                    timer.clear();
                    for (const event of events) {
                        addDelay(event, baselineTime);
                    }
                    const neededEvents = discardPriorSnapshots(events, baselineTime);
                    let lastPlayedTimestamp = lastPlayedEvent === null || lastPlayedEvent === void 0 ? void 0 : lastPlayedEvent.timestamp;
                    if ((lastPlayedEvent === null || lastPlayedEvent === void 0 ? void 0 : lastPlayedEvent.type) === EventType.IncrementalSnapshot &&
                        lastPlayedEvent.data.source === IncrementalSource.MouseMove) {
                        lastPlayedTimestamp =
                            lastPlayedEvent.timestamp +
                                ((_a = lastPlayedEvent.data.positions[0]) === null || _a === void 0 ? void 0 : _a.timeOffset);
                    }
                    if (baselineTime < (lastPlayedTimestamp || 0)) {
                        emitter.emit(ReplayerEvents.PlayBack);
                    }
                    const syncEvents = new Array();
                    for (const event of neededEvents) {
                        if (lastPlayedTimestamp &&
                            lastPlayedTimestamp < baselineTime &&
                            (event.timestamp <= lastPlayedTimestamp ||
                                event === lastPlayedEvent)) {
                            continue;
                        }
                        if (event.timestamp < baselineTime) {
                            syncEvents.push(event);
                        }
                        else {
                            const castFn = getCastFn(event, false);
                            timer.addAction({
                                doAction: () => {
                                    castFn();
                                },
                                delay: event.delay,
                            });
                        }
                    }
                    applyEventsSynchronously(syncEvents);
                    emitter.emit(ReplayerEvents.Flush);
                    timer.start();
                },
                pause(ctx) {
                    ctx.timer.clear();
                },
                resetLastPlayedEvent: o((ctx) => {
                    return Object.assign(Object.assign({}, ctx), { lastPlayedEvent: null });
                }),
                startLive: o({
                    baselineTime: (ctx, event) => {
                        ctx.timer.start();
                        if (event.type === 'TO_LIVE' && event.payload.baselineTime) {
                            return event.payload.baselineTime;
                        }
                        return Date.now();
                    },
                }),
                addEvent: o((ctx, machineEvent) => {
                    const { baselineTime, timer, events } = ctx;
                    if (machineEvent.type === 'ADD_EVENT') {
                        const { event } = machineEvent.payload;
                        addDelay(event, baselineTime);
                        let end = events.length - 1;
                        if (!events[end] || events[end].timestamp <= event.timestamp) {
                            events.push(event);
                        }
                        else {
                            let insertionIndex = -1;
                            let start = 0;
                            while (start <= end) {
                                const mid = Math.floor((start + end) / 2);
                                if (events[mid].timestamp <= event.timestamp) {
                                    start = mid + 1;
                                }
                                else {
                                    end = mid - 1;
                                }
                            }
                            if (insertionIndex === -1) {
                                insertionIndex = start;
                            }
                            events.splice(insertionIndex, 0, event);
                        }
                        const isSync = event.timestamp < baselineTime;
                        const castFn = getCastFn(event, isSync);
                        if (isSync) {
                            castFn();
                        }
                        else if (timer.isActive()) {
                            timer.addAction({
                                doAction: () => {
                                    castFn();
                                },
                                delay: event.delay,
                            });
                        }
                    }
                    return Object.assign(Object.assign({}, ctx), { events });
                }),
            },
        });
        return v(playerMachine);
    }
    function createSpeedService(context) {
        const speedMachine = s({
            id: 'speed',
            context,
            initial: 'normal',
            states: {
                normal: {
                    on: {
                        FAST_FORWARD: {
                            target: 'skipping',
                            actions: ['recordSpeed', 'setSpeed'],
                        },
                        SET_SPEED: {
                            target: 'normal',
                            actions: ['setSpeed'],
                        },
                    },
                },
                skipping: {
                    on: {
                        BACK_TO_NORMAL: {
                            target: 'normal',
                            actions: ['restoreSpeed'],
                        },
                        SET_SPEED: {
                            target: 'normal',
                            actions: ['setSpeed'],
                        },
                    },
                },
            },
        }, {
            actions: {
                setSpeed: (ctx, event) => {
                    if ('payload' in event) {
                        ctx.timer.setSpeed(event.payload.speed);
                    }
                },
                recordSpeed: o({
                    normalSpeed: (ctx) => ctx.timer.speed,
                }),
                restoreSpeed: (ctx) => {
                    ctx.timer.setSpeed(ctx.normalSpeed);
                },
            },
        });
        return v(speedMachine);
    }

    const rules = (blockClass) => [
        `.${blockClass} { background: currentColor }`,
        'noscript { display: none !important; }',
    ];

    const webGLVarMap = new Map();
    function variableListFor(ctx, ctor) {
        let contextMap = webGLVarMap.get(ctx);
        if (!contextMap) {
            contextMap = new Map();
            webGLVarMap.set(ctx, contextMap);
        }
        if (!contextMap.has(ctor)) {
            contextMap.set(ctor, []);
        }
        return contextMap.get(ctor);
    }
    function deserializeArg(imageMap, ctx, preload) {
        return (arg) => __awaiter(this, void 0, void 0, function* () {
            if (arg && typeof arg === 'object' && 'rr_type' in arg) {
                if (preload)
                    preload.isUnchanged = false;
                if (arg.rr_type === 'ImageBitmap' && 'args' in arg) {
                    const args = yield deserializeArg(imageMap, ctx, preload)(arg.args);
                    return yield createImageBitmap.apply(null, args);
                }
                else if ('index' in arg) {
                    if (preload || ctx === null)
                        return arg;
                    const { rr_type: name, index } = arg;
                    return variableListFor(ctx, name)[index];
                }
                else if ('args' in arg) {
                    const { rr_type: name, args } = arg;
                    const ctor = window[name];
                    return new ctor(...(yield Promise.all(args.map(deserializeArg(imageMap, ctx, preload)))));
                }
                else if ('base64' in arg) {
                    return decode(arg.base64);
                }
                else if ('src' in arg) {
                    const image = imageMap.get(arg.src);
                    if (image) {
                        return image;
                    }
                    else {
                        const image = new Image();
                        image.src = arg.src;
                        imageMap.set(arg.src, image);
                        return image;
                    }
                }
                else if ('data' in arg && arg.rr_type === 'Blob') {
                    const blobContents = yield Promise.all(arg.data.map(deserializeArg(imageMap, ctx, preload)));
                    const blob = new Blob(blobContents, {
                        type: arg.type,
                    });
                    return blob;
                }
            }
            else if (Array.isArray(arg)) {
                const result = yield Promise.all(arg.map(deserializeArg(imageMap, ctx, preload)));
                return result;
            }
            return arg;
        });
    }

    function getContext(target, type) {
        try {
            if (type === CanvasContext.WebGL) {
                return (target.getContext('webgl') || target.getContext('experimental-webgl'));
            }
            return target.getContext('webgl2');
        }
        catch (e) {
            return null;
        }
    }
    const WebGLVariableConstructorsNames = [
        'WebGLActiveInfo',
        'WebGLBuffer',
        'WebGLFramebuffer',
        'WebGLProgram',
        'WebGLRenderbuffer',
        'WebGLShader',
        'WebGLShaderPrecisionFormat',
        'WebGLTexture',
        'WebGLUniformLocation',
        'WebGLVertexArrayObject',
    ];
    function saveToWebGLVarMap(ctx, result) {
        if (!(result === null || result === void 0 ? void 0 : result.constructor))
            return;
        const { name } = result.constructor;
        if (!WebGLVariableConstructorsNames.includes(name))
            return;
        const variables = variableListFor(ctx, name);
        if (!variables.includes(result))
            variables.push(result);
    }
    function webglMutation({ mutation, target, type, imageMap, errorHandler, }) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const ctx = getContext(target, type);
                if (!ctx)
                    return;
                if (mutation.setter) {
                    ctx[mutation.property] = mutation.args[0];
                    return;
                }
                const original = ctx[mutation.property];
                const args = yield Promise.all(mutation.args.map(deserializeArg(imageMap, ctx)));
                const result = original.apply(ctx, args);
                saveToWebGLVarMap(ctx, result);
                const debugMode = false;
                if (debugMode) ;
            }
            catch (error) {
                errorHandler(mutation, error);
            }
        });
    }

    function canvasMutation$1({ event, mutations, target, imageMap, errorHandler, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const ctx = target.getContext('2d');
            if (!ctx) {
                errorHandler(mutations[0], new Error('Canvas context is null'));
                return;
            }
            const mutationArgsPromises = mutations.map((mutation) => __awaiter(this, void 0, void 0, function* () {
                return Promise.all(mutation.args.map(deserializeArg(imageMap, ctx)));
            }));
            const args = yield Promise.all(mutationArgsPromises);
            args.forEach((args, index) => {
                const mutation = mutations[index];
                try {
                    if (mutation.setter) {
                        ctx[mutation.property] =
                            mutation.args[0];
                        return;
                    }
                    const original = ctx[mutation.property];
                    if (mutation.property === 'drawImage' &&
                        typeof mutation.args[0] === 'string') {
                        imageMap.get(event);
                        original.apply(ctx, mutation.args);
                    }
                    else {
                        original.apply(ctx, args);
                    }
                }
                catch (error) {
                    errorHandler(mutation, error);
                }
                return;
            });
        });
    }

    function canvasMutation({ event, mutation, target, imageMap, canvasEventMap, errorHandler, }) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const precomputedMutation = canvasEventMap.get(event) || mutation;
                const commands = 'commands' in precomputedMutation
                    ? precomputedMutation.commands
                    : [precomputedMutation];
                if ([CanvasContext.WebGL, CanvasContext.WebGL2].includes(mutation.type)) {
                    for (let i = 0; i < commands.length; i++) {
                        const command = commands[i];
                        yield webglMutation({
                            mutation: command,
                            type: mutation.type,
                            target,
                            imageMap,
                            errorHandler,
                        });
                    }
                    return;
                }
                yield canvasMutation$1({
                    event,
                    mutations: commands,
                    target,
                    imageMap,
                    errorHandler,
                });
            }
            catch (error) {
                errorHandler(mutation, error);
            }
        });
    }

    const SKIP_TIME_THRESHOLD$1 = 10 * 1000;
    const SKIP_TIME_INTERVAL = 5 * 1000;
    const mitt = mitt$1 || mitt$1$1;
    const REPLAY_CONSOLE_PREFIX = '[replayer]';
    const defaultMouseTailConfig = {
        duration: 500,
        lineCap: 'round',
        lineWidth: 3,
        strokeStyle: 'red',
    };
    function indicatesTouchDevice(e) {
        return (e.type == EventType.IncrementalSnapshot &&
            (e.data.source == IncrementalSource.TouchMove ||
                (e.data.source == IncrementalSource.MouseInteraction &&
                    e.data.type == MouseInteractions.TouchStart)));
    }
    class Replayer {
        get timer() {
            return this.service.state.context.timer;
        }
        constructor(events, config) {
            this.usingVirtualDom = false;
            this.virtualDom = new RRDocument();
            this.mouseTail = null;
            this.tailPositions = [];
            this.emitter = mitt();
            this.legacy_missingNodeRetryMap = {};
            this.cache = createCache();
            this.imageMap = new Map();
            this.canvasEventMap = new Map();
            this.mirror = createMirror$2();
            this.styleMirror = new StyleSheetMirror();
            this.firstFullSnapshot = null;
            this.newDocumentQueue = [];
            this.mousePos = null;
            this.touchActive = null;
            this.lastMouseDownEvent = null;
            this.lastSelectionData = null;
            this.constructedStyleMutations = [];
            this.adoptedStyleSheets = [];
            this.handleResize = (dimension) => {
                this.iframe.style.display = 'inherit';
                for (const el of [this.mouseTail, this.iframe]) {
                    if (!el) {
                        continue;
                    }
                    el.setAttribute('width', String(dimension.width));
                    el.setAttribute('height', String(dimension.height));
                }
            };
            this.applyEventsSynchronously = (events) => {
                for (const event of events) {
                    switch (event.type) {
                        case EventType.DomContentLoaded:
                        case EventType.Load:
                        case EventType.Custom:
                            continue;
                        case EventType.FullSnapshot:
                        case EventType.Meta:
                        case EventType.Plugin:
                        case EventType.IncrementalSnapshot:
                            break;
                    }
                    const castFn = this.getCastFn(event, true);
                    castFn();
                }
            };
            this.getCastFn = (event, isSync = false) => {
                let castFn;
                switch (event.type) {
                    case EventType.DomContentLoaded:
                    case EventType.Load:
                        break;
                    case EventType.Custom:
                        castFn = () => {
                            this.emitter.emit(ReplayerEvents.CustomEvent, event);
                        };
                        break;
                    case EventType.Meta:
                        castFn = () => this.emitter.emit(ReplayerEvents.Resize, {
                            width: event.data.width,
                            height: event.data.height,
                        });
                        break;
                    case EventType.FullSnapshot:
                        castFn = () => {
                            var _a;
                            if (this.firstFullSnapshot) {
                                if (this.firstFullSnapshot === event) {
                                    this.firstFullSnapshot = true;
                                    return;
                                }
                            }
                            else {
                                this.firstFullSnapshot = true;
                            }
                            this.rebuildFullSnapshot(event, isSync);
                            (_a = this.iframe.contentWindow) === null || _a === void 0 ? void 0 : _a.scrollTo(event.data.initialOffset);
                            this.styleMirror.reset();
                        };
                        break;
                    case EventType.IncrementalSnapshot:
                        castFn = () => {
                            this.applyIncremental(event, isSync);
                            if (isSync) {
                                return;
                            }
                            if (event === this.nextUserInteractionEvent) {
                                this.nextUserInteractionEvent = null;
                                this.backToNormal();
                            }
                            if (this.config.skipInactive && !this.nextUserInteractionEvent) {
                                for (const _event of this.service.state.context.events) {
                                    if (_event.timestamp <= event.timestamp) {
                                        continue;
                                    }
                                    if (this.isUserInteraction(_event)) {
                                        if (_event.delay - event.delay >
                                            SKIP_TIME_THRESHOLD$1 *
                                                this.speedService.state.context.timer.speed) {
                                            this.nextUserInteractionEvent = _event;
                                        }
                                        break;
                                    }
                                }
                                if (this.nextUserInteractionEvent) {
                                    const skipTime = this.nextUserInteractionEvent.delay - event.delay;
                                    const payload = {
                                        speed: Math.min(Math.round(skipTime / SKIP_TIME_INTERVAL), this.config.maxSpeed),
                                    };
                                    this.speedService.send({ type: 'FAST_FORWARD', payload });
                                    this.emitter.emit(ReplayerEvents.SkipStart, payload);
                                }
                            }
                        };
                        break;
                }
                const wrappedCastFn = () => {
                    if (castFn) {
                        castFn();
                    }
                    for (const plugin of this.config.plugins || []) {
                        if (plugin.handler)
                            plugin.handler(event, isSync, { replayer: this });
                    }
                    this.service.send({ type: 'CAST_EVENT', payload: { event } });
                    const last_index = this.service.state.context.events.length - 1;
                    if (!this.config.liveMode &&
                        event === this.service.state.context.events[last_index]) {
                        const finish = () => {
                            if (last_index < this.service.state.context.events.length - 1) {
                                return;
                            }
                            this.backToNormal();
                            this.service.send('END');
                            this.emitter.emit(ReplayerEvents.Finish);
                        };
                        let finish_buffer = 50;
                        if (event.type === EventType.IncrementalSnapshot &&
                            event.data.source === IncrementalSource.MouseMove &&
                            event.data.positions.length) {
                            finish_buffer += Math.max(0, -event.data.positions[0].timeOffset);
                        }
                        setTimeout(finish, finish_buffer);
                    }
                    this.emitter.emit(ReplayerEvents.EventCast, event);
                };
                return wrappedCastFn;
            };
            if (!(config === null || config === void 0 ? void 0 : config.liveMode) && events.length < 2) {
                throw new Error('Replayer need at least 2 events.');
            }
            const defaultConfig = {
                speed: 1,
                maxSpeed: 360,
                root: document.body,
                loadTimeout: 0,
                skipInactive: false,
                showWarning: true,
                showDebug: false,
                blockClass: 'rr-block',
                liveMode: false,
                insertStyleRules: [],
                triggerFocus: true,
                UNSAFE_replayCanvas: false,
                pauseAnimation: true,
                mouseTail: defaultMouseTailConfig,
                useVirtualDom: true,
                logger: console,
                mutateChildNodes: false
            };
            this.config = Object.assign({}, defaultConfig, config);
            this.handleResize = this.handleResize.bind(this);
            this.getCastFn = this.getCastFn.bind(this);
            this.applyEventsSynchronously = this.applyEventsSynchronously.bind(this);
            this.emitter.on(ReplayerEvents.Resize, this.handleResize);
            this.setupDom();
            for (const plugin of this.config.plugins || []) {
                if (plugin.getMirror)
                    plugin.getMirror({ nodeMirror: this.mirror });
            }
            this.emitter.on(ReplayerEvents.Flush, () => {
                if (this.usingVirtualDom) {
                    const replayerHandler = {
                        mirror: this.mirror,
                        applyCanvas: (canvasEvent, canvasMutationData, target) => {
                            void canvasMutation({
                                event: canvasEvent,
                                mutation: canvasMutationData,
                                target,
                                imageMap: this.imageMap,
                                canvasEventMap: this.canvasEventMap,
                                errorHandler: this.warnCanvasMutationFailed.bind(this),
                            });
                        },
                        applyInput: this.applyInput.bind(this),
                        applyScroll: this.applyScroll.bind(this),
                        applyStyleSheetMutation: (data, styleSheet) => {
                            if (data.source === IncrementalSource.StyleSheetRule)
                                this.applyStyleSheetRule(data, styleSheet);
                            else if (data.source === IncrementalSource.StyleDeclaration)
                                this.applyStyleDeclaration(data, styleSheet);
                        },
                        afterAppend: (node, id) => {
                            for (const plugin of this.config.plugins || []) {
                                if (plugin.onBuild)
                                    plugin.onBuild(node, { id, replayer: this });
                            }
                        },
                    };
                    if (this.iframe.contentDocument)
                        try {
                            diff(this.iframe.contentDocument, this.virtualDom, replayerHandler, this.virtualDom.mirror);
                        }
                        catch (e) {
                            console.warn(e);
                        }
                    this.virtualDom.destroyTree();
                    this.usingVirtualDom = false;
                    if (Object.keys(this.legacy_missingNodeRetryMap).length) {
                        for (const key in this.legacy_missingNodeRetryMap) {
                            try {
                                const value = this.legacy_missingNodeRetryMap[key];
                                const realNode = createOrGetNode(value.node, this.mirror, this.virtualDom.mirror);
                                diff(realNode, value.node, replayerHandler, this.virtualDom.mirror);
                                value.node = realNode;
                            }
                            catch (error) {
                                this.warn(error);
                            }
                        }
                    }
                    this.constructedStyleMutations.forEach((data) => {
                        this.applyStyleSheetMutation(data);
                    });
                    this.constructedStyleMutations = [];
                    this.adoptedStyleSheets.forEach((data) => {
                        this.applyAdoptedStyleSheet(data);
                    });
                    this.adoptedStyleSheets = [];
                }
                if (this.mousePos) {
                    this.moveAndHover(this.mousePos.x, this.mousePos.y, this.mousePos.id, true, this.mousePos.debugData);
                    this.mousePos = null;
                }
                if (this.touchActive === true) {
                    this.mouse.classList.add('touch-active');
                }
                else if (this.touchActive === false) {
                    this.mouse.classList.remove('touch-active');
                }
                this.touchActive = null;
                if (this.lastMouseDownEvent) {
                    const [target, event] = this.lastMouseDownEvent;
                    target.dispatchEvent(event);
                }
                this.lastMouseDownEvent = null;
                if (this.lastSelectionData) {
                    this.applySelection(this.lastSelectionData);
                    this.lastSelectionData = null;
                }
            });
            this.emitter.on(ReplayerEvents.PlayBack, () => {
                this.firstFullSnapshot = null;
                this.mirror.reset();
                this.styleMirror.reset();
            });
            const timer = new Timer([], {
                speed: this.config.speed,
            });
            this.service = createPlayerService({
                events: events
                    .map((e) => {
                    if (config && config.unpackFn) {
                        return config.unpackFn(e);
                    }
                    return e;
                })
                    .sort((a1, a2) => a1.timestamp - a2.timestamp),
                timer,
                timeOffset: 0,
                baselineTime: 0,
                lastPlayedEvent: null,
            }, {
                getCastFn: this.getCastFn,
                applyEventsSynchronously: this.applyEventsSynchronously,
                emitter: this.emitter,
            });
            this.service.start();
            this.service.subscribe((state) => {
                this.emitter.emit(ReplayerEvents.StateChange, {
                    player: state,
                });
            });
            this.speedService = createSpeedService({
                normalSpeed: -1,
                timer,
            });
            this.speedService.start();
            this.speedService.subscribe((state) => {
                this.emitter.emit(ReplayerEvents.StateChange, {
                    speed: state,
                });
            });
            const firstMeta = this.service.state.context.events.find((e) => e.type === EventType.Meta);
            const firstFullsnapshot = this.service.state.context.events.find((e) => e.type === EventType.FullSnapshot);
            if (firstMeta) {
                const { width, height } = firstMeta.data;
                setTimeout(() => {
                    this.emitter.emit(ReplayerEvents.Resize, {
                        width,
                        height,
                    });
                }, 0);
            }
            if (firstFullsnapshot) {
                setTimeout(() => {
                    var _a;
                    if (this.firstFullSnapshot) {
                        return;
                    }
                    this.firstFullSnapshot = firstFullsnapshot;
                    this.rebuildFullSnapshot(firstFullsnapshot);
                    (_a = this.iframe.contentWindow) === null || _a === void 0 ? void 0 : _a.scrollTo(firstFullsnapshot.data.initialOffset);
                }, 1);
            }
            if (this.service.state.context.events.find(indicatesTouchDevice)) {
                this.mouse.classList.add('touch-device');
            }
        }
        on(event, handler) {
            this.emitter.on(event, handler);
            return this;
        }
        off(event, handler) {
            this.emitter.off(event, handler);
            return this;
        }
        setConfig(config) {
            Object.keys(config).forEach((key) => {
                config[key];
                this.config[key] = config[key];
            });
            if (!this.config.skipInactive) {
                this.backToNormal();
            }
            if (typeof config.speed !== 'undefined') {
                this.speedService.send({
                    type: 'SET_SPEED',
                    payload: {
                        speed: config.speed,
                    },
                });
            }
            if (typeof config.mouseTail !== 'undefined') {
                if (config.mouseTail === false) {
                    if (this.mouseTail) {
                        this.mouseTail.style.display = 'none';
                    }
                }
                else {
                    if (!this.mouseTail) {
                        this.mouseTail = document.createElement('canvas');
                        this.mouseTail.width = Number.parseFloat(this.iframe.width);
                        this.mouseTail.height = Number.parseFloat(this.iframe.height);
                        this.mouseTail.classList.add('replayer-mouse-tail');
                        this.wrapper.insertBefore(this.mouseTail, this.iframe);
                    }
                    this.mouseTail.style.display = 'inherit';
                }
            }
        }
        getMetaData() {
            const firstEvent = this.service.state.context.events[0];
            const lastEvent = this.service.state.context.events[this.service.state.context.events.length - 1];
            return {
                startTime: firstEvent.timestamp,
                endTime: lastEvent.timestamp,
                totalTime: lastEvent.timestamp - firstEvent.timestamp,
            };
        }
        getCurrentTime() {
            return this.timer.timeOffset + this.getTimeOffset();
        }
        getTimeOffset() {
            const { baselineTime, events } = this.service.state.context;
            return baselineTime - events[0].timestamp;
        }
        getMirror() {
            return this.mirror;
        }
        play(timeOffset = 0) {
            var _a, _b;
            if (this.service.state.matches('paused')) {
                this.service.send({ type: 'PLAY', payload: { timeOffset } });
            }
            else {
                this.service.send({ type: 'PAUSE' });
                this.service.send({ type: 'PLAY', payload: { timeOffset } });
            }
            (_b = (_a = this.iframe.contentDocument) === null || _a === void 0 ? void 0 : _a.getElementsByTagName('html')[0]) === null || _b === void 0 ? void 0 : _b.classList.remove('rrweb-paused');
            this.emitter.emit(ReplayerEvents.Start);
        }
        pause(timeOffset) {
            var _a, _b;
            if (timeOffset === undefined && this.service.state.matches('playing')) {
                this.service.send({ type: 'PAUSE' });
            }
            if (typeof timeOffset === 'number') {
                this.play(timeOffset);
                this.service.send({ type: 'PAUSE' });
            }
            (_b = (_a = this.iframe.contentDocument) === null || _a === void 0 ? void 0 : _a.getElementsByTagName('html')[0]) === null || _b === void 0 ? void 0 : _b.classList.add('rrweb-paused');
            this.emitter.emit(ReplayerEvents.Pause);
        }
        resume(timeOffset = 0) {
            this.warn(`The 'resume' was deprecated in 1.0. Please use 'play' method which has the same interface.`);
            this.play(timeOffset);
            this.emitter.emit(ReplayerEvents.Resume);
        }
        destroy() {
            this.pause();
            this.config.root.removeChild(this.wrapper);
            this.emitter.emit(ReplayerEvents.Destroy);
        }
        startLive(baselineTime) {
            this.service.send({ type: 'TO_LIVE', payload: { baselineTime } });
        }
        addEvent(rawEvent) {
            const event = this.config.unpackFn
                ? this.config.unpackFn(rawEvent)
                : rawEvent;
            if (indicatesTouchDevice(event)) {
                this.mouse.classList.add('touch-device');
            }
            void Promise.resolve().then(() => this.service.send({ type: 'ADD_EVENT', payload: { event } }));
        }
        enableInteract() {
            this.iframe.setAttribute('scrolling', 'auto');
            this.iframe.style.pointerEvents = 'auto';
        }
        disableInteract() {
            this.iframe.setAttribute('scrolling', 'no');
            this.iframe.style.pointerEvents = 'none';
        }
        resetCache() {
            this.cache = createCache();
        }
        setupDom() {
            this.wrapper = document.createElement('div');
            this.wrapper.classList.add('replayer-wrapper');
            this.config.root.appendChild(this.wrapper);
            this.mouse = document.createElement('div');
            this.mouse.classList.add('replayer-mouse');
            this.wrapper.appendChild(this.mouse);
            if (this.config.mouseTail !== false) {
                this.mouseTail = document.createElement('canvas');
                this.mouseTail.classList.add('replayer-mouse-tail');
                this.mouseTail.style.display = 'inherit';
                this.wrapper.appendChild(this.mouseTail);
            }
            this.iframe = document.createElement('iframe');
            const attributes = ['allow-same-origin'];
            if (this.config.UNSAFE_replayCanvas) {
                attributes.push('allow-scripts');
            }
            this.iframe.style.display = 'none';
            this.iframe.setAttribute('sandbox', attributes.join(' '));
            this.disableInteract();
            this.wrapper.appendChild(this.iframe);
            if (this.iframe.contentWindow && this.iframe.contentDocument) {
                polyfill(this.iframe.contentWindow, this.iframe.contentDocument);
                polyfill$1(this.iframe.contentWindow);
            }
        }
        rebuildFullSnapshot(event, isSync = false) {
            if (!this.iframe.contentDocument) {
                return this.warn('Looks like your replayer has been destroyed.');
            }
            if (Object.keys(this.legacy_missingNodeRetryMap).length) {
                this.warn('Found unresolved missing node map', this.legacy_missingNodeRetryMap);
            }
            this.legacy_missingNodeRetryMap = {};
            const collected = [];
            const afterAppend = (builtNode, id) => {
                this.collectIframeAndAttachDocument(collected, builtNode);
                for (const plugin of this.config.plugins || []) {
                    if (plugin.onBuild)
                        plugin.onBuild(builtNode, {
                            id,
                            replayer: this,
                        });
                }
            };
            if (this.usingVirtualDom) {
                this.virtualDom.destroyTree();
                this.usingVirtualDom = false;
            }
            this.mirror.reset();
            rebuild(event.data.node, {
                doc: this.iframe.contentDocument,
                afterAppend,
                cache: this.cache,
                mirror: this.mirror,
            });
            afterAppend(this.iframe.contentDocument, event.data.node.id);
            for (const { mutationInQueue, builtNode } of collected) {
                this.attachDocumentToIframe(mutationInQueue, builtNode);
                this.newDocumentQueue = this.newDocumentQueue.filter((m) => m !== mutationInQueue);
            }
            const { documentElement, head } = this.iframe.contentDocument;
            this.insertStyleRules(documentElement, head);
            if (!this.service.state.matches('playing')) {
                this.iframe.contentDocument
                    .getElementsByTagName('html')[0]
                    .classList.add('rrweb-paused');
            }
            this.emitter.emit(ReplayerEvents.FullsnapshotRebuilded, event);
            if (!isSync) {
                this.waitForStylesheetLoad();
            }
            if (this.config.UNSAFE_replayCanvas) {
                void this.preloadAllImages();
            }
        }
        insertStyleRules(documentElement, head) {
            var _a;
            const injectStylesRules = rules(this.config.blockClass).concat(this.config.insertStyleRules);
            if (this.config.pauseAnimation) {
                injectStylesRules.push('html.rrweb-paused *, html.rrweb-paused *:before, html.rrweb-paused *:after { animation-play-state: paused !important; }');
            }
            if (this.usingVirtualDom) {
                const styleEl = this.virtualDom.createElement('style');
                this.virtualDom.mirror.add(styleEl, getDefaultSN(styleEl, this.virtualDom.unserializedId));
                documentElement.insertBefore(styleEl, head);
                styleEl.rules.push({
                    source: IncrementalSource.StyleSheetRule,
                    adds: injectStylesRules.map((cssText, index) => ({
                        rule: cssText,
                        index,
                    })),
                });
            }
            else {
                const styleEl = document.createElement('style');
                documentElement.insertBefore(styleEl, head);
                for (let idx = 0; idx < injectStylesRules.length; idx++) {
                    (_a = styleEl.sheet) === null || _a === void 0 ? void 0 : _a.insertRule(injectStylesRules[idx], idx);
                }
            }
        }
        attachDocumentToIframe(mutation, iframeEl) {
            const mirror = this.usingVirtualDom
                ? this.virtualDom.mirror
                : this.mirror;
            const collected = [];
            const afterAppend = (builtNode, id) => {
                this.collectIframeAndAttachDocument(collected, builtNode);
                const sn = mirror.getMeta(builtNode);
                if ((sn === null || sn === void 0 ? void 0 : sn.type) === NodeType$2.Element &&
                    (sn === null || sn === void 0 ? void 0 : sn.tagName.toUpperCase()) === 'HTML') {
                    const { documentElement, head } = iframeEl.contentDocument;
                    this.insertStyleRules(documentElement, head);
                }
                if (this.usingVirtualDom)
                    return;
                for (const plugin of this.config.plugins || []) {
                    if (plugin.onBuild)
                        plugin.onBuild(builtNode, {
                            id,
                            replayer: this,
                        });
                }
            };
            buildNodeWithSN(mutation.node, {
                doc: iframeEl.contentDocument,
                mirror: mirror,
                hackCss: true,
                skipChild: false,
                afterAppend,
                cache: this.cache,
            });
            afterAppend(iframeEl.contentDocument, mutation.node.id);
            for (const { mutationInQueue, builtNode } of collected) {
                this.attachDocumentToIframe(mutationInQueue, builtNode);
                this.newDocumentQueue = this.newDocumentQueue.filter((m) => m !== mutationInQueue);
            }
        }
        collectIframeAndAttachDocument(collected, builtNode) {
            if (isSerializedIframe(builtNode, this.mirror)) {
                const mutationInQueue = this.newDocumentQueue.find((m) => m.parentId === this.mirror.getId(builtNode));
                if (mutationInQueue) {
                    collected.push({
                        mutationInQueue,
                        builtNode: builtNode,
                    });
                }
            }
        }
        waitForStylesheetLoad() {
            var _a;
            const head = (_a = this.iframe.contentDocument) === null || _a === void 0 ? void 0 : _a.head;
            if (head) {
                const unloadSheets = new Set();
                let timer;
                let beforeLoadState = this.service.state;
                const stateHandler = () => {
                    beforeLoadState = this.service.state;
                };
                this.emitter.on(ReplayerEvents.Start, stateHandler);
                this.emitter.on(ReplayerEvents.Pause, stateHandler);
                const unsubscribe = () => {
                    this.emitter.off(ReplayerEvents.Start, stateHandler);
                    this.emitter.off(ReplayerEvents.Pause, stateHandler);
                };
                head
                    .querySelectorAll('link[rel="stylesheet"]')
                    .forEach((css) => {
                    if (!css.sheet) {
                        unloadSheets.add(css);
                        css.addEventListener('load', () => {
                            unloadSheets.delete(css);
                            if (unloadSheets.size === 0 && timer !== -1) {
                                if (beforeLoadState.matches('playing')) {
                                    this.play(this.getCurrentTime());
                                }
                                this.emitter.emit(ReplayerEvents.LoadStylesheetEnd);
                                if (timer) {
                                    clearTimeout(timer);
                                }
                                unsubscribe();
                            }
                        });
                    }
                });
                if (unloadSheets.size > 0) {
                    this.service.send({ type: 'PAUSE' });
                    this.emitter.emit(ReplayerEvents.LoadStylesheetStart);
                    timer = setTimeout(() => {
                        if (beforeLoadState.matches('playing')) {
                            this.play(this.getCurrentTime());
                        }
                        timer = -1;
                        unsubscribe();
                    }, this.config.loadTimeout);
                }
            }
        }
        preloadAllImages() {
            return __awaiter(this, void 0, void 0, function* () {
                this.service.state;
                const stateHandler = () => {
                    this.service.state;
                };
                this.emitter.on(ReplayerEvents.Start, stateHandler);
                this.emitter.on(ReplayerEvents.Pause, stateHandler);
                const promises = [];
                for (const event of this.service.state.context.events) {
                    if (event.type === EventType.IncrementalSnapshot &&
                        event.data.source === IncrementalSource.CanvasMutation) {
                        promises.push(this.deserializeAndPreloadCanvasEvents(event.data, event));
                        const commands = 'commands' in event.data ? event.data.commands : [event.data];
                        commands.forEach((c) => {
                            this.preloadImages(c, event);
                        });
                    }
                }
                return Promise.all(promises);
            });
        }
        preloadImages(data, event) {
            if (data.property === 'drawImage' &&
                typeof data.args[0] === 'string' &&
                !this.imageMap.has(event)) {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const imgd = ctx === null || ctx === void 0 ? void 0 : ctx.createImageData(canvas.width, canvas.height);
                imgd === null || imgd === void 0 ? void 0 : imgd.data;
                JSON.parse(data.args[0]);
                ctx === null || ctx === void 0 ? void 0 : ctx.putImageData(imgd, 0, 0);
            }
        }
        deserializeAndPreloadCanvasEvents(data, event) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!this.canvasEventMap.has(event)) {
                    const status = {
                        isUnchanged: true,
                    };
                    if ('commands' in data) {
                        const commands = yield Promise.all(data.commands.map((c) => __awaiter(this, void 0, void 0, function* () {
                            const args = yield Promise.all(c.args.map(deserializeArg(this.imageMap, null, status)));
                            return Object.assign(Object.assign({}, c), { args });
                        })));
                        if (status.isUnchanged === false)
                            this.canvasEventMap.set(event, Object.assign(Object.assign({}, data), { commands }));
                    }
                    else {
                        const args = yield Promise.all(data.args.map(deserializeArg(this.imageMap, null, status)));
                        if (status.isUnchanged === false)
                            this.canvasEventMap.set(event, Object.assign(Object.assign({}, data), { args }));
                    }
                }
            });
        }
        applyIncremental(e, isSync) {
            var _a, _b, _c;
            const { data: d } = e;
            switch (d.source) {
                case IncrementalSource.Mutation: {
                    try {
                        this.applyMutation(d, isSync);
                    }
                    catch (error) {
                        this.warn(`Exception in mutation ${error.message || error}`, d);
                    }
                    break;
                }
                case IncrementalSource.Drag:
                case IncrementalSource.TouchMove:
                case IncrementalSource.MouseMove:
                    if (isSync) {
                        const lastPosition = d.positions[d.positions.length - 1];
                        this.mousePos = {
                            x: lastPosition.x,
                            y: lastPosition.y,
                            id: lastPosition.id,
                            debugData: d,
                        };
                    }
                    else {
                        d.positions.forEach((p) => {
                            const action = {
                                doAction: () => {
                                    this.moveAndHover(p.x, p.y, p.id, isSync, d);
                                },
                                delay: p.timeOffset +
                                    e.timestamp -
                                    this.service.state.context.baselineTime,
                            };
                            this.timer.addAction(action);
                        });
                        this.timer.addAction({
                            doAction() {
                            },
                            delay: e.delay - ((_a = d.positions[0]) === null || _a === void 0 ? void 0 : _a.timeOffset),
                        });
                    }
                    break;
                case IncrementalSource.MouseInteraction: {
                    if (d.id === -1) {
                        break;
                    }
                    const event = new Event(toLowerCase(MouseInteractions[d.type]));
                    const target = this.mirror.getNode(d.id);
                    if (!target) {
                        return this.debugNodeNotFound(d, d.id);
                    }
                    this.emitter.emit(ReplayerEvents.MouseInteraction, {
                        type: d.type,
                        target,
                    });
                    const { triggerFocus } = this.config;
                    switch (d.type) {
                        case MouseInteractions.Blur:
                            if ('blur' in target) {
                                target.blur();
                            }
                            break;
                        case MouseInteractions.Focus:
                            if (triggerFocus && target.focus) {
                                target.focus({
                                    preventScroll: true,
                                });
                            }
                            break;
                        case MouseInteractions.Click:
                        case MouseInteractions.TouchStart:
                        case MouseInteractions.TouchEnd:
                        case MouseInteractions.MouseDown:
                        case MouseInteractions.MouseUp:
                            if (isSync) {
                                if (d.type === MouseInteractions.TouchStart) {
                                    this.touchActive = true;
                                }
                                else if (d.type === MouseInteractions.TouchEnd) {
                                    this.touchActive = false;
                                }
                                if (d.type === MouseInteractions.MouseDown) {
                                    this.lastMouseDownEvent = [target, event];
                                }
                                else if (d.type === MouseInteractions.MouseUp) {
                                    this.lastMouseDownEvent = null;
                                }
                                this.mousePos = {
                                    x: d.x,
                                    y: d.y,
                                    id: d.id,
                                    debugData: d,
                                };
                            }
                            else {
                                if (d.type === MouseInteractions.TouchStart) {
                                    this.tailPositions.length = 0;
                                }
                                this.moveAndHover(d.x, d.y, d.id, isSync, d);
                                if (d.type === MouseInteractions.Click) {
                                    this.mouse.classList.remove('active');
                                    void this.mouse.offsetWidth;
                                    this.mouse.classList.add('active');
                                }
                                else if (d.type === MouseInteractions.TouchStart) {
                                    void this.mouse.offsetWidth;
                                    this.mouse.classList.add('touch-active');
                                }
                                else if (d.type === MouseInteractions.TouchEnd) {
                                    this.mouse.classList.remove('touch-active');
                                }
                                else {
                                    target.dispatchEvent(event);
                                }
                            }
                            break;
                        case MouseInteractions.TouchCancel:
                            if (isSync) {
                                this.touchActive = false;
                            }
                            else {
                                this.mouse.classList.remove('touch-active');
                            }
                            break;
                        default:
                            target.dispatchEvent(event);
                    }
                    break;
                }
                case IncrementalSource.Scroll: {
                    if (d.id === -1) {
                        break;
                    }
                    if (this.usingVirtualDom) {
                        const target = this.virtualDom.mirror.getNode(d.id);
                        if (!target) {
                            return this.debugNodeNotFound(d, d.id);
                        }
                        target.scrollData = d;
                        break;
                    }
                    this.applyScroll(d, isSync);
                    break;
                }
                case IncrementalSource.ViewportResize:
                    this.emitter.emit(ReplayerEvents.Resize, {
                        width: d.width,
                        height: d.height,
                    });
                    break;
                case IncrementalSource.Input: {
                    if (d.id === -1) {
                        break;
                    }
                    if (this.usingVirtualDom) {
                        const target = this.virtualDom.mirror.getNode(d.id);
                        if (!target) {
                            return this.debugNodeNotFound(d, d.id);
                        }
                        target.inputData = d;
                        break;
                    }
                    this.applyInput(d);
                    break;
                }
                case IncrementalSource.MediaInteraction: {
                    const target = this.usingVirtualDom
                        ? this.virtualDom.mirror.getNode(d.id)
                        : this.mirror.getNode(d.id);
                    if (!target) {
                        return this.debugNodeNotFound(d, d.id);
                    }
                    const mediaEl = target;
                    try {
                        if (d.currentTime !== undefined) {
                            mediaEl.currentTime = d.currentTime;
                        }
                        if (d.volume !== undefined) {
                            mediaEl.volume = d.volume;
                        }
                        if (d.muted !== undefined) {
                            mediaEl.muted = d.muted;
                        }
                        if (d.type === 1) {
                            mediaEl.pause();
                        }
                        if (d.type === 0) {
                            void mediaEl.play();
                        }
                        if (d.type === 4) {
                            mediaEl.playbackRate = d.playbackRate;
                        }
                    }
                    catch (error) {
                        this.warn(`Failed to replay media interactions: ${error.message || error}`);
                    }
                    break;
                }
                case IncrementalSource.StyleSheetRule:
                case IncrementalSource.StyleDeclaration: {
                    if (this.usingVirtualDom) {
                        if (d.styleId)
                            this.constructedStyleMutations.push(d);
                        else if (d.id)
                            (_b = this.virtualDom.mirror.getNode(d.id)) === null || _b === void 0 ? void 0 : _b.rules.push(d);
                    }
                    else
                        this.applyStyleSheetMutation(d);
                    break;
                }
                case IncrementalSource.CanvasMutation: {
                    if (!this.config.UNSAFE_replayCanvas) {
                        return;
                    }
                    if (this.usingVirtualDom) {
                        const target = this.virtualDom.mirror.getNode(d.id);
                        if (!target) {
                            return this.debugNodeNotFound(d, d.id);
                        }
                        target.canvasMutations.push({
                            event: e,
                            mutation: d,
                        });
                    }
                    else {
                        const target = this.mirror.getNode(d.id);
                        if (!target) {
                            return this.debugNodeNotFound(d, d.id);
                        }
                        void canvasMutation({
                            event: e,
                            mutation: d,
                            target: target,
                            imageMap: this.imageMap,
                            canvasEventMap: this.canvasEventMap,
                            errorHandler: this.warnCanvasMutationFailed.bind(this),
                        });
                    }
                    break;
                }
                case IncrementalSource.Font: {
                    try {
                        const fontFace = new FontFace(d.family, d.buffer
                            ? new Uint8Array(JSON.parse(d.fontSource))
                            : d.fontSource, d.descriptors);
                        (_c = this.iframe.contentDocument) === null || _c === void 0 ? void 0 : _c.fonts.add(fontFace);
                    }
                    catch (error) {
                        this.warn(error);
                    }
                    break;
                }
                case IncrementalSource.Selection: {
                    if (isSync) {
                        this.lastSelectionData = d;
                        break;
                    }
                    this.applySelection(d);
                    break;
                }
                case IncrementalSource.AdoptedStyleSheet: {
                    if (this.usingVirtualDom)
                        this.adoptedStyleSheets.push(d);
                    else
                        this.applyAdoptedStyleSheet(d);
                    break;
                }
            }
        }
        applyMutation(d, isSync) {
            if (this.config.useVirtualDom && !this.usingVirtualDom && isSync) {
                this.usingVirtualDom = true;
                buildFromDom(this.iframe.contentDocument, this.mirror, this.virtualDom);
                if (Object.keys(this.legacy_missingNodeRetryMap).length) {
                    for (const key in this.legacy_missingNodeRetryMap) {
                        try {
                            const value = this.legacy_missingNodeRetryMap[key];
                            const virtualNode = buildFromNode(value.node, this.virtualDom, this.mirror);
                            if (virtualNode)
                                value.node = virtualNode;
                        }
                        catch (error) {
                            this.warn(error);
                        }
                    }
                }
            }
            const mirror = this.usingVirtualDom ? this.virtualDom.mirror : this.mirror;
            d.removes = d.removes.filter((mutation) => {
                if (!mirror.getNode(mutation.id)) {
                    this.warnNodeNotFound(d, mutation.id);
                    return false;
                }
                return true;
            });
            d.removes.forEach((mutation) => {
                var _a;
                const target = mirror.getNode(mutation.id);
                if (!target) {
                    return;
                }
                let parent = mirror.getNode(mutation.parentId);
                if (!parent) {
                    return this.warnNodeNotFound(d, mutation.parentId);
                }
                if (mutation.isShadow && hasShadowRoot(parent)) {
                    parent = parent.shadowRoot;
                }
                mirror.removeNodeFromMap(target);
                if (parent)
                    try {
                        parent.removeChild(target);
                        if (this.usingVirtualDom &&
                            target.nodeName === '#text' &&
                            parent.nodeName === 'STYLE' &&
                            ((_a = parent.rules) === null || _a === void 0 ? void 0 : _a.length) > 0)
                            parent.rules = [];
                    }
                    catch (error) {
                        if (error instanceof DOMException) {
                            this.warn('parent could not remove child in mutation', parent, target, d);
                        }
                        else {
                            throw error;
                        }
                    }
            });
            const legacy_missingNodeMap = Object.assign({}, this.legacy_missingNodeRetryMap);
            const queue = [];
            const nextNotInDOM = (mutation) => {
                let next = null;
                if (mutation.nextId) {
                    next = mirror.getNode(mutation.nextId);
                }
                if (mutation.nextId !== null &&
                    mutation.nextId !== undefined &&
                    mutation.nextId !== -1 &&
                    !next) {
                    return true;
                }
                return false;
            };
            const appendNode = (mutation) => {
                var _a, _b;
                if (!this.iframe.contentDocument) {
                    return this.warn('Looks like your replayer has been destroyed.');
                }
                let parent = mirror.getNode(mutation.parentId);
                if (!parent) {
                    if (mutation.node.type === NodeType$2.Document) {
                        return this.newDocumentQueue.push(mutation);
                    }
                    return queue.push(mutation);
                }
                if (mutation.node.isShadow) {
                    if (!hasShadowRoot(parent)) {
                        parent.attachShadow({ mode: 'open' });
                        parent = parent.shadowRoot;
                    }
                    else
                        parent = parent.shadowRoot;
                }
                let previous = null;
                let next = null;
                if (mutation.previousId) {
                    previous = mirror.getNode(mutation.previousId);
                }
                if (mutation.nextId) {
                    next = mirror.getNode(mutation.nextId);
                }
                if (nextNotInDOM(mutation)) {
                    return queue.push(mutation);
                }
                if (mutation.node.rootId && !mirror.getNode(mutation.node.rootId)) {
                    return;
                }
                const targetDoc = mutation.node.rootId
                    ? mirror.getNode(mutation.node.rootId)
                    : this.usingVirtualDom
                        ? this.virtualDom
                        : this.iframe.contentDocument;
                if (isSerializedIframe(parent, mirror)) {
                    this.attachDocumentToIframe(mutation, parent);
                    return;
                }
                const afterAppend = (node, id) => {
                    if (this.usingVirtualDom)
                        return;
                    for (const plugin of this.config.plugins || []) {
                        if (plugin.onBuild)
                            plugin.onBuild(node, { id, replayer: this });
                    }
                };
                const target = buildNodeWithSN(mutation.node, {
                    doc: targetDoc,
                    mirror: mirror,
                    skipChild: !this.config.mutateChildNodes,
                    hackCss: true,
                    cache: this.cache,
                    afterAppend,
                });
                if (mutation.previousId === -1 || mutation.nextId === -1) {
                    legacy_missingNodeMap[mutation.node.id] = {
                        node: target,
                        mutation,
                    };
                    return;
                }
                const parentSn = mirror.getMeta(parent);
                if (parentSn &&
                    parentSn.type === NodeType$2.Element &&
                    parentSn.tagName === 'textarea' &&
                    mutation.node.type === NodeType$2.Text) {
                    const childNodeArray = Array.isArray(parent.childNodes)
                        ? parent.childNodes
                        : Array.from(parent.childNodes);
                    for (const c of childNodeArray) {
                        if (c.nodeType === parent.TEXT_NODE) {
                            parent.removeChild(c);
                        }
                    }
                }
                else if ((parentSn === null || parentSn === void 0 ? void 0 : parentSn.type) === NodeType$2.Document) {
                    const parentDoc = parent;
                    if (mutation.node.type === NodeType$2.DocumentType &&
                        ((_a = parentDoc.childNodes[0]) === null || _a === void 0 ? void 0 : _a.nodeType) === Node.DOCUMENT_TYPE_NODE)
                        parentDoc.removeChild(parentDoc.childNodes[0]);
                    if (target.nodeName === 'HTML' && parentDoc.documentElement)
                        parentDoc.removeChild(parentDoc.documentElement);
                }
                if (previous && previous.nextSibling && previous.nextSibling.parentNode) {
                    parent.insertBefore(target, previous.nextSibling);
                }
                else if (next && next.parentNode) {
                    parent.contains(next)
                        ? parent.insertBefore(target, next)
                        : parent.insertBefore(target, null);
                }
                else {
                    parent.appendChild(target);
                }
                afterAppend(target, mutation.node.id);
                if (this.usingVirtualDom &&
                    target.nodeName === '#text' &&
                    parent.nodeName === 'STYLE' &&
                    ((_b = parent.rules) === null || _b === void 0 ? void 0 : _b.length) > 0)
                    parent.rules = [];
                if (isSerializedIframe(target, this.mirror)) {
                    const targetId = this.mirror.getId(target);
                    const mutationInQueue = this.newDocumentQueue.find((m) => m.parentId === targetId);
                    if (mutationInQueue) {
                        this.attachDocumentToIframe(mutationInQueue, target);
                        this.newDocumentQueue = this.newDocumentQueue.filter((m) => m !== mutationInQueue);
                    }
                }
                if (mutation.previousId || mutation.nextId) {
                    this.legacy_resolveMissingNode(legacy_missingNodeMap, parent, target, mutation);
                }
            };
            d.adds.forEach((mutation) => {
                appendNode(mutation);
            });
            const startTime = Date.now();
            while (queue.length) {
                const resolveTrees = queueToResolveTrees(queue);
                queue.length = 0;
                if (Date.now() - startTime > 500) {
                    this.warn('Timeout in the loop, please check the resolve tree data:', resolveTrees);
                    break;
                }
                for (const tree of resolveTrees) {
                    const parent = mirror.getNode(tree.value.parentId);
                    if (!parent) {
                        this.debug('Drop resolve tree since there is no parent for the root node.', tree);
                    }
                    else {
                        iterateResolveTree(tree, (mutation) => {
                            appendNode(mutation);
                        });
                    }
                }
            }
            if (Object.keys(legacy_missingNodeMap).length) {
                Object.assign(this.legacy_missingNodeRetryMap, legacy_missingNodeMap);
            }
            uniqueTextMutations(d.texts).forEach((mutation) => {
                var _a;
                const target = mirror.getNode(mutation.id);
                if (!target) {
                    if (d.removes.find((r) => r.id === mutation.id)) {
                        return;
                    }
                    return this.warnNodeNotFound(d, mutation.id);
                }
                target.textContent = mutation.value;
                if (this.usingVirtualDom) {
                    const parent = target.parentNode;
                    if (((_a = parent === null || parent === void 0 ? void 0 : parent.rules) === null || _a === void 0 ? void 0 : _a.length) > 0)
                        parent.rules = [];
                }
            });
            d.attributes.forEach((mutation) => {
                const target = mirror.getNode(mutation.id);
                if (!target) {
                    if (d.removes.find((r) => r.id === mutation.id)) {
                        return;
                    }
                    return this.warnNodeNotFound(d, mutation.id);
                }
                for (const attributeName in mutation.attributes) {
                    if (typeof attributeName === 'string') {
                        const value = mutation.attributes[attributeName];
                        if (value === null) {
                            target.removeAttribute(attributeName);
                        }
                        else if (typeof value === 'string') {
                            try {
                                if (attributeName === '_cssText' &&
                                    (target.nodeName === 'LINK' || target.nodeName === 'STYLE')) {
                                    try {
                                        const newSn = mirror.getMeta(target);
                                        Object.assign(newSn.attributes, mutation.attributes);
                                        const newNode = buildNodeWithSN(newSn, {
                                            doc: target.ownerDocument,
                                            mirror: mirror,
                                            skipChild: !this.config.mutateChildNodes,
                                            hackCss: true,
                                            cache: this.cache,
                                        });
                                        const siblingNode = target.nextSibling;
                                        const parentNode = target.parentNode;
                                        if (newNode && parentNode) {
                                            parentNode.removeChild(target);
                                            parentNode.insertBefore(newNode, siblingNode);
                                            mirror.replace(mutation.id, newNode);
                                            break;
                                        }
                                    }
                                    catch (e) {
                                    }
                                }
                                target.setAttribute(attributeName, value);
                            }
                            catch (error) {
                                this.warn('An error occurred may due to the checkout feature.', error);
                            }
                        }
                        else if (attributeName === 'style') {
                            const styleValues = value;
                            const targetEl = target;
                            for (const s in styleValues) {
                                if (styleValues[s] === false) {
                                    targetEl.style.removeProperty(s);
                                }
                                else if (styleValues[s] instanceof Array) {
                                    const svp = styleValues[s];
                                    targetEl.style.setProperty(s, svp[0], svp[1]);
                                }
                                else {
                                    const svs = styleValues[s];
                                    targetEl.style.setProperty(s, svs);
                                }
                            }
                        }
                    }
                }
            });
        }
        applyScroll(d, isSync) {
            var _a, _b;
            const target = this.mirror.getNode(d.id);
            if (!target) {
                return this.debugNodeNotFound(d, d.id);
            }
            const sn = this.mirror.getMeta(target);
            if (target === this.iframe.contentDocument) {
                (_a = this.iframe.contentWindow) === null || _a === void 0 ? void 0 : _a.scrollTo({
                    top: d.y,
                    left: d.x,
                    behavior: isSync ? 'auto' : 'smooth',
                });
            }
            else if ((sn === null || sn === void 0 ? void 0 : sn.type) === NodeType$2.Document) {
                (_b = target.defaultView) === null || _b === void 0 ? void 0 : _b.scrollTo({
                    top: d.y,
                    left: d.x,
                    behavior: isSync ? 'auto' : 'smooth',
                });
            }
            else {
                try {
                    target.scrollTo({
                        top: d.y,
                        left: d.x,
                        behavior: isSync ? 'auto' : 'smooth',
                    });
                }
                catch (error) {
                }
            }
        }
        applyInput(d) {
            const target = this.mirror.getNode(d.id);
            if (!target) {
                return this.debugNodeNotFound(d, d.id);
            }
            try {
                target.checked = d.isChecked;
                target.value = d.text;
            }
            catch (error) {
            }
        }
        applySelection(d) {
            try {
                const selectionSet = new Set();
                const ranges = d.ranges.map(({ start, startOffset, end, endOffset }) => {
                    const startContainer = this.mirror.getNode(start);
                    const endContainer = this.mirror.getNode(end);
                    if (!startContainer || !endContainer)
                        return;
                    const result = new Range();
                    result.setStart(startContainer, startOffset);
                    result.setEnd(endContainer, endOffset);
                    const doc = startContainer.ownerDocument;
                    const selection = doc === null || doc === void 0 ? void 0 : doc.getSelection();
                    selection && selectionSet.add(selection);
                    return {
                        range: result,
                        selection,
                    };
                });
                selectionSet.forEach((s) => s.removeAllRanges());
                ranges.forEach((r) => { var _a; return r && ((_a = r.selection) === null || _a === void 0 ? void 0 : _a.addRange(r.range)); });
            }
            catch (error) {
            }
        }
        applyStyleSheetMutation(data) {
            var _a;
            let styleSheet = null;
            if (data.styleId)
                styleSheet = this.styleMirror.getStyle(data.styleId);
            else if (data.id)
                styleSheet =
                    ((_a = this.mirror.getNode(data.id)) === null || _a === void 0 ? void 0 : _a.sheet) || null;
            if (!styleSheet)
                return;
            if (data.source === IncrementalSource.StyleSheetRule)
                this.applyStyleSheetRule(data, styleSheet);
            else if (data.source === IncrementalSource.StyleDeclaration)
                this.applyStyleDeclaration(data, styleSheet);
        }
        applyStyleSheetRule(data, styleSheet) {
            var _a, _b, _c, _d;
            (_a = data.adds) === null || _a === void 0 ? void 0 : _a.forEach(({ rule, index: nestedIndex }) => {
                try {
                    if (Array.isArray(nestedIndex)) {
                        const { positions, index } = getPositionsAndIndex(nestedIndex);
                        const nestedRule = getNestedRule(styleSheet.cssRules, positions);
                        nestedRule.insertRule(rule, index);
                    }
                    else {
                        const index = nestedIndex === undefined
                            ? undefined
                            : Math.min(nestedIndex, styleSheet.cssRules.length);
                        styleSheet === null || styleSheet === void 0 ? void 0 : styleSheet.insertRule(rule, index);
                    }
                }
                catch (e) {
                }
            });
            (_b = data.removes) === null || _b === void 0 ? void 0 : _b.forEach(({ index: nestedIndex }) => {
                try {
                    if (Array.isArray(nestedIndex)) {
                        const { positions, index } = getPositionsAndIndex(nestedIndex);
                        const nestedRule = getNestedRule(styleSheet.cssRules, positions);
                        nestedRule.deleteRule(index || 0);
                    }
                    else {
                        styleSheet === null || styleSheet === void 0 ? void 0 : styleSheet.deleteRule(nestedIndex);
                    }
                }
                catch (e) {
                }
            });
            if (data.replace)
                try {
                    void ((_c = styleSheet.replace) === null || _c === void 0 ? void 0 : _c.call(styleSheet, data.replace));
                }
                catch (e) {
                }
            if (data.replaceSync)
                try {
                    (_d = styleSheet.replaceSync) === null || _d === void 0 ? void 0 : _d.call(styleSheet, data.replaceSync);
                }
                catch (e) {
                }
        }
        applyStyleDeclaration(data, styleSheet) {
            if (data.set) {
                const rule = getNestedRule(styleSheet.rules, data.index);
                rule.style.setProperty(data.set.property, data.set.value, data.set.priority);
            }
            if (data.remove) {
                const rule = getNestedRule(styleSheet.rules, data.index);
                rule.style.removeProperty(data.remove.property);
            }
        }
        applyAdoptedStyleSheet(data) {
            var _a;
            const targetHost = this.mirror.getNode(data.id);
            if (!targetHost)
                return;
            (_a = data.styles) === null || _a === void 0 ? void 0 : _a.forEach((style) => {
                var _a;
                let newStyleSheet = null;
                let hostWindow = null;
                if (hasShadowRoot(targetHost))
                    hostWindow = ((_a = targetHost.ownerDocument) === null || _a === void 0 ? void 0 : _a.defaultView) || null;
                else if (targetHost.nodeName === '#document')
                    hostWindow = targetHost.defaultView;
                if (!hostWindow)
                    return;
                try {
                    newStyleSheet = new hostWindow.CSSStyleSheet();
                    this.styleMirror.add(newStyleSheet, style.styleId);
                    this.applyStyleSheetRule({
                        source: IncrementalSource.StyleSheetRule,
                        adds: style.rules,
                    }, newStyleSheet);
                }
                catch (e) {
                }
            });
            const MAX_RETRY_TIME = 10;
            let count = 0;
            const adoptStyleSheets = (targetHost, styleIds) => {
                const stylesToAdopt = styleIds
                    .map((styleId) => this.styleMirror.getStyle(styleId))
                    .filter((style) => style !== null);
                if (hasShadowRoot(targetHost))
                    targetHost.shadowRoot.adoptedStyleSheets =
                        stylesToAdopt;
                else if (targetHost.nodeName === '#document')
                    targetHost.adoptedStyleSheets = stylesToAdopt;
                if (stylesToAdopt.length !== styleIds.length && count < MAX_RETRY_TIME) {
                    setTimeout(() => adoptStyleSheets(targetHost, styleIds), 0 + 100 * count);
                    count++;
                }
            };
            adoptStyleSheets(targetHost, data.styleIds);
        }
        legacy_resolveMissingNode(map, parent, target, targetMutation) {
            const { previousId, nextId } = targetMutation;
            const previousInMap = previousId && map[previousId];
            const nextInMap = nextId && map[nextId];
            if (previousInMap) {
                const { node, mutation } = previousInMap;
                parent.insertBefore(node, target);
                delete map[mutation.node.id];
                delete this.legacy_missingNodeRetryMap[mutation.node.id];
                if (mutation.previousId || mutation.nextId) {
                    this.legacy_resolveMissingNode(map, parent, node, mutation);
                }
            }
            if (nextInMap) {
                const { node, mutation } = nextInMap;
                parent.insertBefore(node, target.nextSibling);
                delete map[mutation.node.id];
                delete this.legacy_missingNodeRetryMap[mutation.node.id];
                if (mutation.previousId || mutation.nextId) {
                    this.legacy_resolveMissingNode(map, parent, node, mutation);
                }
            }
        }
        moveAndHover(x, y, id, isSync, debugData) {
            const target = this.mirror.getNode(id);
            if (!target) {
                return this.debugNodeNotFound(debugData, id);
            }
            const base = getBaseDimension(target, this.iframe);
            const _x = x * base.absoluteScale + base.x;
            const _y = y * base.absoluteScale + base.y;
            this.mouse.style.left = `${_x}px`;
            this.mouse.style.top = `${_y}px`;
            if (!isSync) {
                this.drawMouseTail({ x: _x, y: _y });
            }
            this.hoverElements(target);
        }
        drawMouseTail(position) {
            if (!this.mouseTail) {
                return;
            }
            const { lineCap, lineWidth, strokeStyle, duration } = this.config.mouseTail === true
                ? defaultMouseTailConfig
                : Object.assign({}, defaultMouseTailConfig, this.config.mouseTail);
            const draw = () => {
                if (!this.mouseTail) {
                    return;
                }
                const ctx = this.mouseTail.getContext('2d');
                if (!ctx || !this.tailPositions.length) {
                    return;
                }
                ctx.clearRect(0, 0, this.mouseTail.width, this.mouseTail.height);
                ctx.beginPath();
                ctx.lineWidth = lineWidth;
                ctx.lineCap = lineCap;
                ctx.strokeStyle = strokeStyle;
                ctx.moveTo(this.tailPositions[0].x, this.tailPositions[0].y);
                this.tailPositions.forEach((p) => ctx.lineTo(p.x, p.y));
                ctx.stroke();
            };
            this.tailPositions.push(position);
            draw();
            setTimeout(() => {
                this.tailPositions = this.tailPositions.filter((p) => p !== position);
                draw();
            }, duration / this.speedService.state.context.timer.speed);
        }
        hoverElements(el) {
            var _a;
            (_a = (this.lastHoveredRootNode || this.iframe.contentDocument)) === null || _a === void 0 ? void 0 : _a.querySelectorAll('.\\:hover').forEach((hoveredEl) => {
                hoveredEl.classList.remove(':hover');
            });
            this.lastHoveredRootNode = el.getRootNode();
            let currentEl = el;
            while (currentEl) {
                if (currentEl.classList) {
                    currentEl.classList.add(':hover');
                }
                currentEl = currentEl.parentElement;
            }
        }
        isUserInteraction(event) {
            if (event.type !== EventType.IncrementalSnapshot) {
                return false;
            }
            return (event.data.source > IncrementalSource.Mutation &&
                event.data.source <= IncrementalSource.Input);
        }
        backToNormal() {
            this.nextUserInteractionEvent = null;
            if (this.speedService.state.matches('normal')) {
                return;
            }
            this.speedService.send({ type: 'BACK_TO_NORMAL' });
            this.emitter.emit(ReplayerEvents.SkipEnd, {
                speed: this.speedService.state.context.normalSpeed,
            });
        }
        warnNodeNotFound(d, id) {
            this.warn(`Node with id '${id}' not found. `, d);
        }
        warnCanvasMutationFailed(d, error) {
            this.warn(`Has error on canvas update`, error, 'canvas mutation:', d);
        }
        debugNodeNotFound(d, id) {
            this.debug(`Node with id '${id}' not found. `, d);
        }
        warn(...args) {
            if (!this.config.showWarning) {
                return;
            }
            this.config.logger.warn(REPLAY_CONSOLE_PREFIX, ...args);
        }
        debug(...args) {
            if (!this.config.showDebug) {
                return;
            }
            this.config.logger.log(REPLAY_CONSOLE_PREFIX, ...args);
        }
    }

    function inlineCss(cssObj) {
        let style = '';
        Object.keys(cssObj).forEach((key) => {
            style += `${key}: ${cssObj[key]};`;
        });
        return style;
    }
    function padZero(num, len = 2) {
        let str = String(num);
        const threshold = Math.pow(10, len - 1);
        if (num < threshold) {
            while (String(threshold).length > str.length) {
                str = `0${num}`;
            }
        }
        return str;
    }
    const SECOND = 1000;
    const MINUTE = 60 * SECOND;
    const HOUR = 60 * MINUTE;
    function formatTime(ms) {
        if (ms <= 0) {
            return '00:00';
        }
        const hour = Math.floor(ms / HOUR);
        ms = ms % HOUR;
        const minute = Math.floor(ms / MINUTE);
        ms = ms % MINUTE;
        const second = Math.floor(ms / SECOND);
        if (hour) {
            return `${padZero(hour)}:${padZero(minute)}:${padZero(second)}`;
        }
        return `${padZero(minute)}:${padZero(second)}`;
    }
    function openFullscreen(el) {
        if (el.requestFullscreen) {
            return el.requestFullscreen();
        }
        else if (el.mozRequestFullScreen) {
            /* Firefox */
            return el.mozRequestFullScreen();
        }
        else if (el.webkitRequestFullscreen) {
            /* Chrome, Safari and Opera */
            return el.webkitRequestFullscreen();
        }
        else if (el.msRequestFullscreen) {
            /* IE/Edge */
            return el.msRequestFullscreen();
        }
    }
    function exitFullscreen() {
        if (document.exitFullscreen) {
            return document.exitFullscreen();
        }
        else if (document.mozExitFullscreen) {
            /* Firefox */
            return document.mozExitFullscreen();
        }
        else if (document.webkitExitFullscreen) {
            /* Chrome, Safari and Opera */
            return document.webkitExitFullscreen();
        }
        else if (document.msExitFullscreen) {
            /* IE/Edge */
            return document.msExitFullscreen();
        }
    }
    function isFullscreen() {
        let fullscreen = false;
        [
            'fullscreen',
            'webkitIsFullScreen',
            'mozFullScreen',
            'msFullscreenElement',
        ].forEach((fullScreenAccessor) => {
            if (fullScreenAccessor in document) {
                fullscreen = fullscreen || Boolean(document[fullScreenAccessor]);
            }
        });
        return fullscreen;
    }
    function onFullscreenChange(handler) {
        document.addEventListener('fullscreenchange', handler);
        document.addEventListener('webkitfullscreenchange', handler);
        document.addEventListener('mozfullscreenchange', handler);
        document.addEventListener('MSFullscreenChange', handler);
        return () => {
            document.removeEventListener('fullscreenchange', handler);
            document.removeEventListener('webkitfullscreenchange', handler);
            document.removeEventListener('mozfullscreenchange', handler);
            document.removeEventListener('MSFullscreenChange', handler);
        };
    }
    function typeOf(obj) {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const toString = Object.prototype.toString;
        const map = {
            '[object Boolean]': 'boolean',
            '[object Number]': 'number',
            '[object String]': 'string',
            '[object Function]': 'function',
            '[object Array]': 'array',
            '[object Date]': 'date',
            '[object RegExp]': 'regExp',
            '[object Undefined]': 'undefined',
            '[object Null]': 'null',
            '[object Object]': 'object',
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return map[toString.call(obj)];
    }
    /**
     * Forked from 'rrweb' replay/index.ts. The original function is not exported.
     * Determine whether the event is a user interaction event
     * @param event - event to be determined
     * @returns true if the event is a user interaction event
     */
    function isUserInteraction(event) {
        if (event.type !== EventType.IncrementalSnapshot) {
            return false;
        }
        return (event.data.source > IncrementalSource.Mutation &&
            event.data.source <= IncrementalSource.Input);
    }
    // Forked from 'rrweb' replay/index.ts. A const threshold of inactive time.
    const SKIP_TIME_THRESHOLD = 10 * 1000;
    /**
     * Get periods of time when no user interaction happened from a list of events.
     * @param events - all events
     * @returns periods of time consist with [start time, end time]
     */
    function getInactivePeriods(events) {
        const inactivePeriods = [];
        let lastActiveTime = events[0].timestamp;
        for (const event of events) {
            if (!isUserInteraction(event))
                continue;
            if (event.timestamp - lastActiveTime > SKIP_TIME_THRESHOLD) {
                inactivePeriods.push([lastActiveTime, event.timestamp]);
            }
            lastActiveTime = event.timestamp;
        }
        return inactivePeriods;
    }

    /* src/components/Switch.svelte generated by Svelte v3.59.2 */

    const file$2 = "src/components/Switch.svelte";

    function create_fragment$2(ctx) {
    	let div;
    	let input;
    	let t0;
    	let label_1;
    	let t1;
    	let span;
    	let t2;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			input = element("input");
    			t0 = space();
    			label_1 = element("label");
    			t1 = space();
    			span = element("span");
    			t2 = text(/*label*/ ctx[3]);
    			attr_dev(input, "type", "checkbox");
    			attr_dev(input, "id", /*id*/ ctx[2]);
    			input.disabled = /*disabled*/ ctx[1];
    			attr_dev(input, "class", "svelte-9brlez");
    			add_location(input, file$2, 73, 2, 1318);
    			attr_dev(label_1, "for", /*id*/ ctx[2]);
    			attr_dev(label_1, "class", "svelte-9brlez");
    			add_location(label_1, file$2, 74, 2, 1375);
    			attr_dev(span, "class", "label svelte-9brlez");
    			add_location(span, file$2, 75, 2, 1396);
    			attr_dev(div, "class", "switch svelte-9brlez");
    			toggle_class(div, "disabled", /*disabled*/ ctx[1]);
    			add_location(div, file$2, 72, 0, 1280);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, input);
    			input.checked = /*checked*/ ctx[0];
    			append_dev(div, t0);
    			append_dev(div, label_1);
    			append_dev(div, t1);
    			append_dev(div, span);
    			append_dev(span, t2);

    			if (!mounted) {
    				dispose = listen_dev(input, "change", /*input_change_handler*/ ctx[4]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*id*/ 4) {
    				attr_dev(input, "id", /*id*/ ctx[2]);
    			}

    			if (dirty & /*disabled*/ 2) {
    				prop_dev(input, "disabled", /*disabled*/ ctx[1]);
    			}

    			if (dirty & /*checked*/ 1) {
    				input.checked = /*checked*/ ctx[0];
    			}

    			if (dirty & /*id*/ 4) {
    				attr_dev(label_1, "for", /*id*/ ctx[2]);
    			}

    			if (dirty & /*label*/ 8) set_data_dev(t2, /*label*/ ctx[3]);

    			if (dirty & /*disabled*/ 2) {
    				toggle_class(div, "disabled", /*disabled*/ ctx[1]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Switch', slots, []);
    	let { disabled } = $$props;
    	let { checked } = $$props;
    	let { id } = $$props;
    	let { label } = $$props;

    	$$self.$$.on_mount.push(function () {
    		if (disabled === undefined && !('disabled' in $$props || $$self.$$.bound[$$self.$$.props['disabled']])) {
    			console.warn("<Switch> was created without expected prop 'disabled'");
    		}

    		if (checked === undefined && !('checked' in $$props || $$self.$$.bound[$$self.$$.props['checked']])) {
    			console.warn("<Switch> was created without expected prop 'checked'");
    		}

    		if (id === undefined && !('id' in $$props || $$self.$$.bound[$$self.$$.props['id']])) {
    			console.warn("<Switch> was created without expected prop 'id'");
    		}

    		if (label === undefined && !('label' in $$props || $$self.$$.bound[$$self.$$.props['label']])) {
    			console.warn("<Switch> was created without expected prop 'label'");
    		}
    	});

    	const writable_props = ['disabled', 'checked', 'id', 'label'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Switch> was created with unknown prop '${key}'`);
    	});

    	function input_change_handler() {
    		checked = this.checked;
    		$$invalidate(0, checked);
    	}

    	$$self.$$set = $$props => {
    		if ('disabled' in $$props) $$invalidate(1, disabled = $$props.disabled);
    		if ('checked' in $$props) $$invalidate(0, checked = $$props.checked);
    		if ('id' in $$props) $$invalidate(2, id = $$props.id);
    		if ('label' in $$props) $$invalidate(3, label = $$props.label);
    	};

    	$$self.$capture_state = () => ({ disabled, checked, id, label });

    	$$self.$inject_state = $$props => {
    		if ('disabled' in $$props) $$invalidate(1, disabled = $$props.disabled);
    		if ('checked' in $$props) $$invalidate(0, checked = $$props.checked);
    		if ('id' in $$props) $$invalidate(2, id = $$props.id);
    		if ('label' in $$props) $$invalidate(3, label = $$props.label);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [checked, disabled, id, label, input_change_handler];
    }

    class Switch extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { disabled: 1, checked: 0, id: 2, label: 3 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Switch",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get disabled() {
    		throw new Error("<Switch>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<Switch>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get checked() {
    		throw new Error("<Switch>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set checked(value) {
    		throw new Error("<Switch>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get id() {
    		throw new Error("<Switch>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<Switch>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get label() {
    		throw new Error("<Switch>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<Switch>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Controller.svelte generated by Svelte v3.59.2 */
    const file$1 = "src/Controller.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[39] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[42] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[45] = list[i];
    	return child_ctx;
    }

    // (359:0) {#if showController}
    function create_if_block$1(ctx) {
    	let div5;
    	let div3;
    	let span0;
    	let t0_value = formatTime(/*currentTime*/ ctx[6]) + "";
    	let t0;
    	let t1;
    	let div2;
    	let div0;
    	let t2;
    	let t3;
    	let t4;
    	let div1;
    	let t5;
    	let span1;
    	let t6_value = formatTime(/*meta*/ ctx[8].totalTime) + "";
    	let t6;
    	let t7;
    	let div4;
    	let button0;
    	let t8;
    	let t9;
    	let switch_1;
    	let updating_checked;
    	let t10;
    	let button1;
    	let svg;
    	let defs;
    	let style;
    	let path;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value_2 = /*inactivePeriods*/ ctx[14];
    	validate_each_argument(each_value_2);
    	let each_blocks_2 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	let each_value_1 = /*customEvents*/ ctx[9];
    	validate_each_argument(each_value_1);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	function select_block_type(ctx, dirty) {
    		if (/*playerState*/ ctx[7] === 'playing') return create_if_block_1;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);
    	let each_value = /*speedOption*/ ctx[3];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	function switch_1_checked_binding(value) {
    		/*switch_1_checked_binding*/ ctx[30](value);
    	}

    	let switch_1_props = {
    		id: "skip",
    		disabled: /*speedState*/ ctx[10] === 'skipping',
    		label: "skip inactive"
    	};

    	if (/*skipInactive*/ ctx[0] !== void 0) {
    		switch_1_props.checked = /*skipInactive*/ ctx[0];
    	}

    	switch_1 = new Switch({ props: switch_1_props, $$inline: true });
    	binding_callbacks.push(() => bind(switch_1, 'checked', switch_1_checked_binding));

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div3 = element("div");
    			span0 = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			div2 = element("div");
    			div0 = element("div");
    			t2 = space();

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t3 = space();

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t4 = space();
    			div1 = element("div");
    			t5 = space();
    			span1 = element("span");
    			t6 = text(t6_value);
    			t7 = space();
    			div4 = element("div");
    			button0 = element("button");
    			if_block.c();
    			t8 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t9 = space();
    			create_component(switch_1.$$.fragment);
    			t10 = space();
    			button1 = element("button");
    			svg = svg_element("svg");
    			defs = svg_element("defs");
    			style = svg_element("style");
    			path = svg_element("path");
    			attr_dev(span0, "class", "rr-timeline__time svelte-19ke1iv");
    			add_location(span0, file$1, 361, 6, 9485);
    			attr_dev(div0, "class", "rr-progress__step svelte-19ke1iv");
    			set_style(div0, "width", /*percentage*/ ctx[13]);
    			add_location(div0, file$1, 368, 8, 9724);
    			attr_dev(div1, "class", "rr-progress__handler svelte-19ke1iv");
    			set_style(div1, "left", /*percentage*/ ctx[13]);
    			add_location(div1, file$1, 389, 8, 10407);
    			attr_dev(div2, "class", "rr-progress svelte-19ke1iv");
    			toggle_class(div2, "disabled", /*speedState*/ ctx[10] === 'skipping');
    			add_location(div2, file$1, 362, 6, 9556);
    			attr_dev(span1, "class", "rr-timeline__time svelte-19ke1iv");
    			add_location(span1, file$1, 391, 6, 10490);
    			attr_dev(div3, "class", "rr-timeline svelte-19ke1iv");
    			add_location(div3, file$1, 360, 4, 9453);
    			attr_dev(button0, "class", "svelte-19ke1iv");
    			add_location(button0, file$1, 394, 6, 10613);
    			attr_dev(style, "type", "text/css");
    			add_location(style, file$1, 465, 12, 13220);
    			add_location(defs, file$1, 464, 10, 13201);
    			attr_dev(path, "d", "M916 380c-26.4 0-48-21.6-48-48L868 223.2 613.6 477.6c-18.4\n            18.4-48.8 18.4-68 0-18.4-18.4-18.4-48.8 0-68L800 156 692 156c-26.4\n            0-48-21.6-48-48 0-26.4 21.6-48 48-48l224 0c26.4 0 48 21.6 48 48l0\n            224C964 358.4 942.4 380 916 380zM231.2 860l108.8 0c26.4 0 48 21.6 48\n            48s-21.6 48-48 48l-224 0c-26.4 0-48-21.6-48-48l0-224c0-26.4 21.6-48\n            48-48 26.4 0 48 21.6 48 48L164 792l253.6-253.6c18.4-18.4 48.8-18.4\n            68 0 18.4 18.4 18.4 48.8 0 68L231.2 860z");
    			attr_dev(path, "p-id", "1286");
    			add_location(path, file$1, 467, 10, 13280);
    			attr_dev(svg, "class", "icon");
    			attr_dev(svg, "viewBox", "0 0 1024 1024");
    			attr_dev(svg, "version", "1.1");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "xmlns:xlink", "http://www.w3.org/1999/xlink");
    			attr_dev(svg, "width", "16");
    			attr_dev(svg, "height", "16");
    			add_location(svg, file$1, 455, 8, 12954);
    			attr_dev(button1, "class", "svelte-19ke1iv");
    			add_location(button1, file$1, 454, 6, 12897);
    			attr_dev(div4, "class", "rr-controller__btns svelte-19ke1iv");
    			add_location(div4, file$1, 393, 4, 10573);
    			attr_dev(div5, "class", "rr-controller svelte-19ke1iv");
    			add_location(div5, file$1, 359, 2, 9421);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div3);
    			append_dev(div3, span0);
    			append_dev(span0, t0);
    			append_dev(div3, t1);
    			append_dev(div3, div2);
    			append_dev(div2, div0);
    			/*div0_binding*/ ctx[27](div0);
    			append_dev(div2, t2);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				if (each_blocks_2[i]) {
    					each_blocks_2[i].m(div2, null);
    				}
    			}

    			append_dev(div2, t3);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				if (each_blocks_1[i]) {
    					each_blocks_1[i].m(div2, null);
    				}
    			}

    			append_dev(div2, t4);
    			append_dev(div2, div1);
    			/*div2_binding*/ ctx[28](div2);
    			append_dev(div3, t5);
    			append_dev(div3, span1);
    			append_dev(span1, t6);
    			append_dev(div5, t7);
    			append_dev(div5, div4);
    			append_dev(div4, button0);
    			if_block.m(button0, null);
    			append_dev(div4, t8);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div4, null);
    				}
    			}

    			append_dev(div4, t9);
    			mount_component(switch_1, div4, null);
    			append_dev(div4, t10);
    			append_dev(div4, button1);
    			append_dev(button1, svg);
    			append_dev(svg, defs);
    			append_dev(defs, style);
    			append_dev(svg, path);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(div2, "click", /*handleProgressClick*/ ctx[16], false, false, false, false),
    					listen_dev(button0, "click", /*toggle*/ ctx[4], false, false, false, false),
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[31], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if ((!current || dirty[0] & /*currentTime*/ 64) && t0_value !== (t0_value = formatTime(/*currentTime*/ ctx[6]) + "")) set_data_dev(t0, t0_value);

    			if (!current || dirty[0] & /*percentage*/ 8192) {
    				set_style(div0, "width", /*percentage*/ ctx[13]);
    			}

    			if (dirty[0] & /*inactivePeriods*/ 16384) {
    				each_value_2 = /*inactivePeriods*/ ctx[14];
    				validate_each_argument(each_value_2);
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_2[i] = create_each_block_2(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(div2, t3);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}

    				each_blocks_2.length = each_value_2.length;
    			}

    			if (dirty[0] & /*customEvents*/ 512) {
    				each_value_1 = /*customEvents*/ ctx[9];
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(div2, t4);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (!current || dirty[0] & /*percentage*/ 8192) {
    				set_style(div1, "left", /*percentage*/ ctx[13]);
    			}

    			if (!current || dirty[0] & /*speedState*/ 1024) {
    				toggle_class(div2, "disabled", /*speedState*/ ctx[10] === 'skipping');
    			}

    			if ((!current || dirty[0] & /*meta*/ 256) && t6_value !== (t6_value = formatTime(/*meta*/ ctx[8].totalTime) + "")) set_data_dev(t6, t6_value);

    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(button0, null);
    				}
    			}

    			if (dirty[0] & /*speedState, speedOption, speed, setSpeed*/ 1066) {
    				each_value = /*speedOption*/ ctx[3];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div4, t9);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			const switch_1_changes = {};
    			if (dirty[0] & /*speedState*/ 1024) switch_1_changes.disabled = /*speedState*/ ctx[10] === 'skipping';

    			if (!updating_checked && dirty[0] & /*skipInactive*/ 1) {
    				updating_checked = true;
    				switch_1_changes.checked = /*skipInactive*/ ctx[0];
    				add_flush_callback(() => updating_checked = false);
    			}

    			switch_1.$set(switch_1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(switch_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(switch_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			/*div0_binding*/ ctx[27](null);
    			destroy_each(each_blocks_2, detaching);
    			destroy_each(each_blocks_1, detaching);
    			/*div2_binding*/ ctx[28](null);
    			if_block.d();
    			destroy_each(each_blocks, detaching);
    			destroy_component(switch_1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(359:0) {#if showController}",
    		ctx
    	});

    	return block;
    }

    // (374:8) {#each inactivePeriods as period}
    function create_each_block_2(ctx) {
    	let div;
    	let div_title_value;

    	const block = {
    		c: function create() {
    			div = element("div");
    			attr_dev(div, "title", div_title_value = /*period*/ ctx[45].name);
    			set_style(div, "width", /*period*/ ctx[45].width);
    			set_style(div, "height", "4px");
    			set_style(div, "position", "absolute");
    			set_style(div, "background", /*period*/ ctx[45].background);
    			set_style(div, "left", /*period*/ ctx[45].position);
    			add_location(div, file$1, 374, 10, 9893);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*inactivePeriods*/ 16384 && div_title_value !== (div_title_value = /*period*/ ctx[45].name)) {
    				attr_dev(div, "title", div_title_value);
    			}

    			if (dirty[0] & /*inactivePeriods*/ 16384) {
    				set_style(div, "width", /*period*/ ctx[45].width);
    			}

    			if (dirty[0] & /*inactivePeriods*/ 16384) {
    				set_style(div, "background", /*period*/ ctx[45].background);
    			}

    			if (dirty[0] & /*inactivePeriods*/ 16384) {
    				set_style(div, "left", /*period*/ ctx[45].position);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(374:8) {#each inactivePeriods as period}",
    		ctx
    	});

    	return block;
    }

    // (381:8) {#each customEvents as event}
    function create_each_block_1(ctx) {
    	let div;
    	let div_title_value;

    	const block = {
    		c: function create() {
    			div = element("div");
    			attr_dev(div, "title", div_title_value = /*event*/ ctx[42].name);
    			set_style(div, "width", "10px");
    			set_style(div, "height", "5px");
    			set_style(div, "position", "absolute");
    			set_style(div, "top", "2px");
    			set_style(div, "transform", "translate(-50%, -50%)");
    			set_style(div, "background", /*event*/ ctx[42].background);
    			set_style(div, "left", /*event*/ ctx[42].position);
    			add_location(div, file$1, 381, 10, 10149);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*customEvents*/ 512 && div_title_value !== (div_title_value = /*event*/ ctx[42].name)) {
    				attr_dev(div, "title", div_title_value);
    			}

    			if (dirty[0] & /*customEvents*/ 512) {
    				set_style(div, "background", /*event*/ ctx[42].background);
    			}

    			if (dirty[0] & /*customEvents*/ 512) {
    				set_style(div, "left", /*event*/ ctx[42].position);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(381:8) {#each customEvents as event}",
    		ctx
    	});

    	return block;
    }

    // (423:8) {:else}
    function create_else_block(ctx) {
    	let svg;
    	let path;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr_dev(path, "d", "M170.65984 896l0-768 640 384zM644.66944\n              512l-388.66944-233.32864 0 466.65728z");
    			add_location(path, file$1, 432, 12, 12305);
    			attr_dev(svg, "class", "icon");
    			attr_dev(svg, "viewBox", "0 0 1024 1024");
    			attr_dev(svg, "version", "1.1");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "xmlns:xlink", "http://www.w3.org/1999/xlink");
    			attr_dev(svg, "width", "16");
    			attr_dev(svg, "height", "16");
    			add_location(svg, file$1, 423, 10, 12040);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, path);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(423:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (396:8) {#if playerState === 'playing'}
    function create_if_block_1(ctx) {
    	let svg;
    	let path;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr_dev(path, "d", "M682.65984 128q53.00224 0 90.50112 37.49888t37.49888 90.50112l0\n              512q0 53.00224-37.49888 90.50112t-90.50112\n              37.49888-90.50112-37.49888-37.49888-90.50112l0-512q0-53.00224\n              37.49888-90.50112t90.50112-37.49888zM341.34016 128q53.00224 0\n              90.50112 37.49888t37.49888 90.50112l0 512q0 53.00224-37.49888\n              90.50112t-90.50112\n              37.49888-90.50112-37.49888-37.49888-90.50112l0-512q0-53.00224\n              37.49888-90.50112t90.50112-37.49888zM341.34016 213.34016q-17.67424\n              0-30.16704 12.4928t-12.4928 30.16704l0 512q0 17.67424 12.4928\n              30.16704t30.16704 12.4928 30.16704-12.4928\n              12.4928-30.16704l0-512q0-17.67424-12.4928-30.16704t-30.16704-12.4928zM682.65984\n              213.34016q-17.67424 0-30.16704 12.4928t-12.4928 30.16704l0 512q0\n              17.67424 12.4928 30.16704t30.16704 12.4928 30.16704-12.4928\n              12.4928-30.16704l0-512q0-17.67424-12.4928-30.16704t-30.16704-12.4928z");
    			add_location(path, file$1, 405, 12, 10955);
    			attr_dev(svg, "class", "icon");
    			attr_dev(svg, "viewBox", "0 0 1024 1024");
    			attr_dev(svg, "version", "1.1");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "xmlns:xlink", "http://www.w3.org/1999/xlink");
    			attr_dev(svg, "width", "16");
    			attr_dev(svg, "height", "16");
    			add_location(svg, file$1, 396, 10, 10690);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, path);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(396:8) {#if playerState === 'playing'}",
    		ctx
    	});

    	return block;
    }

    // (440:6) {#each speedOption as s}
    function create_each_block(ctx) {
    	let button;
    	let t0_value = /*s*/ ctx[39] + "";
    	let t0;
    	let t1;
    	let button_disabled_value;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[29](/*s*/ ctx[39]);
    	}

    	const block = {
    		c: function create() {
    			button = element("button");
    			t0 = text(t0_value);
    			t1 = text("x");
    			button.disabled = button_disabled_value = /*speedState*/ ctx[10] === 'skipping';
    			attr_dev(button, "class", "svelte-19ke1iv");
    			toggle_class(button, "active", /*s*/ ctx[39] === /*speed*/ ctx[1] && /*speedState*/ ctx[10] !== 'skipping');
    			add_location(button, file$1, 440, 8, 12522);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, t0);
    			append_dev(button, t1);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", click_handler, false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*speedOption*/ 8 && t0_value !== (t0_value = /*s*/ ctx[39] + "")) set_data_dev(t0, t0_value);

    			if (dirty[0] & /*speedState*/ 1024 && button_disabled_value !== (button_disabled_value = /*speedState*/ ctx[10] === 'skipping')) {
    				prop_dev(button, "disabled", button_disabled_value);
    			}

    			if (dirty[0] & /*speedOption, speed, speedState*/ 1034) {
    				toggle_class(button, "active", /*s*/ ctx[39] === /*speed*/ ctx[1] && /*speedState*/ ctx[10] !== 'skipping');
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(440:6) {#each speedOption as s}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*showController*/ ctx[2] && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (/*showController*/ ctx[2]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*showController*/ 4) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function position(startTime, endTime, tagTime) {
    	const sessionDuration = endTime - startTime;
    	const eventDuration = endTime - tagTime;
    	const eventPosition = 100 - eventDuration / sessionDuration * 100;
    	return eventPosition.toFixed(2);
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Controller', slots, []);
    	const dispatch = createEventDispatcher();
    	let { replayer } = $$props;
    	let { showController } = $$props;
    	let { autoPlay } = $$props;
    	let { skipInactive } = $$props;
    	let { speedOption } = $$props;
    	let { speed = speedOption.length ? speedOption[0] : 1 } = $$props;
    	let { tags = {} } = $$props;
    	let { inactiveColor } = $$props;
    	let currentTime = 0;
    	let timer = null;
    	let playerState;
    	let speedState;
    	let progress;
    	let step;
    	let finished;
    	let pauseAt = false;
    	let onPauseHook = undefined;
    	let loop = null;
    	let meta;
    	let percentage;
    	let customEvents;
    	let inactivePeriods;

    	const loopTimer = () => {
    		stopTimer();

    		function update() {
    			$$invalidate(6, currentTime = replayer.getCurrentTime());

    			if (pauseAt && currentTime >= pauseAt) {
    				if (loop) {
    					playRange(loop.start, loop.end, true, undefined);
    				} else {
    					replayer.pause();

    					if (onPauseHook) {
    						onPauseHook();
    						onPauseHook = null;
    					}
    				}
    			}

    			if (currentTime < meta.totalTime) {
    				timer = requestAnimationFrame(update);
    			}
    		}

    		timer = requestAnimationFrame(update);
    	};

    	const stopTimer = () => {
    		if (timer) {
    			cancelAnimationFrame(timer);
    			timer = null;
    		}
    	};

    	const toggle = () => {
    		switch (playerState) {
    			case 'playing':
    				pause();
    				break;
    			case 'paused':
    				play();
    				break;
    		}
    	};

    	const play = () => {
    		if (playerState !== 'paused') {
    			return;
    		}

    		if (finished) {
    			replayer.play();
    			finished = false;
    		} else {
    			replayer.play(currentTime);
    		}
    	};

    	const pause = () => {
    		if (playerState !== 'playing') {
    			return;
    		}

    		replayer.pause();
    		pauseAt = false;
    	};

    	const goto = (timeOffset, play) => {
    		$$invalidate(6, currentTime = timeOffset);
    		pauseAt = false;
    		finished = false;

    		const resumePlaying = typeof play === 'boolean'
    		? play
    		: playerState === 'playing';

    		if (resumePlaying) {
    			replayer.play(timeOffset);
    		} else {
    			replayer.pause(timeOffset);
    		}
    	};

    	const playRange = (timeOffset, endTimeOffset, startLooping = false, afterHook = undefined) => {
    		if (startLooping) {
    			loop = { start: timeOffset, end: endTimeOffset };
    		} else {
    			loop = null;
    		}

    		$$invalidate(6, currentTime = timeOffset);
    		pauseAt = endTimeOffset;
    		onPauseHook = afterHook;
    		replayer.play(timeOffset);
    	};

    	const handleProgressClick = event => {
    		if (speedState === 'skipping') {
    			return;
    		}

    		const progressRect = progress.getBoundingClientRect();
    		const x = event.clientX - progressRect.left;
    		let percent = x / progressRect.width;

    		if (percent < 0) {
    			percent = 0;
    		} else if (percent > 1) {
    			percent = 1;
    		}

    		const timeOffset = meta.totalTime * percent;
    		goto(timeOffset);
    	};

    	const setSpeed = newSpeed => {
    		let needFreeze = playerState === 'playing';
    		$$invalidate(1, speed = newSpeed);

    		if (needFreeze) {
    			replayer.pause();
    		}

    		replayer.setConfig({ speed });

    		if (needFreeze) {
    			replayer.play(currentTime);
    		}
    	};

    	const toggleSkipInactive = () => {
    		$$invalidate(0, skipInactive = !skipInactive);
    	};

    	const triggerUpdateMeta = () => {
    		return Promise.resolve().then(() => {
    			$$invalidate(8, meta = replayer.getMetaData());
    		});
    	};

    	onMount(() => {
    		$$invalidate(7, playerState = replayer.service.state.value);
    		$$invalidate(10, speedState = replayer.speedService.state.value);

    		replayer.on('state-change', states => {
    			const { player, speed } = states;

    			if ((player === null || player === void 0
    			? void 0
    			: player.value) && playerState !== player.value) {
    				$$invalidate(7, playerState = player.value);

    				switch (playerState) {
    					case 'playing':
    						loopTimer();
    						break;
    					case 'paused':
    						stopTimer();
    						break;
    				}
    			}

    			if ((speed === null || speed === void 0
    			? void 0
    			: speed.value) && speedState !== speed.value) {
    				$$invalidate(10, speedState = speed.value);
    			}
    		});

    		replayer.on('finish', () => {
    			finished = true;

    			if (onPauseHook) {
    				onPauseHook();
    				onPauseHook = null;
    			}
    		});

    		if (autoPlay) {
    			replayer.play();
    		}
    	});

    	afterUpdate(() => {
    		if (skipInactive !== replayer.config.skipInactive) {
    			replayer.setConfig({ skipInactive });
    		}
    	});

    	onDestroy(() => {
    		replayer.pause();
    		stopTimer();
    	});

    	$$self.$$.on_mount.push(function () {
    		if (replayer === undefined && !('replayer' in $$props || $$self.$$.bound[$$self.$$.props['replayer']])) {
    			console.warn("<Controller> was created without expected prop 'replayer'");
    		}

    		if (showController === undefined && !('showController' in $$props || $$self.$$.bound[$$self.$$.props['showController']])) {
    			console.warn("<Controller> was created without expected prop 'showController'");
    		}

    		if (autoPlay === undefined && !('autoPlay' in $$props || $$self.$$.bound[$$self.$$.props['autoPlay']])) {
    			console.warn("<Controller> was created without expected prop 'autoPlay'");
    		}

    		if (skipInactive === undefined && !('skipInactive' in $$props || $$self.$$.bound[$$self.$$.props['skipInactive']])) {
    			console.warn("<Controller> was created without expected prop 'skipInactive'");
    		}

    		if (speedOption === undefined && !('speedOption' in $$props || $$self.$$.bound[$$self.$$.props['speedOption']])) {
    			console.warn("<Controller> was created without expected prop 'speedOption'");
    		}

    		if (inactiveColor === undefined && !('inactiveColor' in $$props || $$self.$$.bound[$$self.$$.props['inactiveColor']])) {
    			console.warn("<Controller> was created without expected prop 'inactiveColor'");
    		}
    	});

    	const writable_props = [
    		'replayer',
    		'showController',
    		'autoPlay',
    		'skipInactive',
    		'speedOption',
    		'speed',
    		'tags',
    		'inactiveColor'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Controller> was created with unknown prop '${key}'`);
    	});

    	function div0_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			step = $$value;
    			$$invalidate(12, step);
    		});
    	}

    	function div2_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			progress = $$value;
    			$$invalidate(11, progress);
    		});
    	}

    	const click_handler = s => setSpeed(s);

    	function switch_1_checked_binding(value) {
    		skipInactive = value;
    		$$invalidate(0, skipInactive);
    	}

    	const click_handler_1 = () => dispatch('fullscreen');

    	$$self.$$set = $$props => {
    		if ('replayer' in $$props) $$invalidate(17, replayer = $$props.replayer);
    		if ('showController' in $$props) $$invalidate(2, showController = $$props.showController);
    		if ('autoPlay' in $$props) $$invalidate(18, autoPlay = $$props.autoPlay);
    		if ('skipInactive' in $$props) $$invalidate(0, skipInactive = $$props.skipInactive);
    		if ('speedOption' in $$props) $$invalidate(3, speedOption = $$props.speedOption);
    		if ('speed' in $$props) $$invalidate(1, speed = $$props.speed);
    		if ('tags' in $$props) $$invalidate(19, tags = $$props.tags);
    		if ('inactiveColor' in $$props) $$invalidate(20, inactiveColor = $$props.inactiveColor);
    	};

    	$$self.$capture_state = () => ({
    		EventType,
    		onMount,
    		onDestroy,
    		createEventDispatcher,
    		afterUpdate,
    		formatTime,
    		getInactivePeriods,
    		Switch,
    		dispatch,
    		replayer,
    		showController,
    		autoPlay,
    		skipInactive,
    		speedOption,
    		speed,
    		tags,
    		inactiveColor,
    		currentTime,
    		timer,
    		playerState,
    		speedState,
    		progress,
    		step,
    		finished,
    		pauseAt,
    		onPauseHook,
    		loop,
    		meta,
    		percentage,
    		position,
    		customEvents,
    		inactivePeriods,
    		loopTimer,
    		stopTimer,
    		toggle,
    		play,
    		pause,
    		goto,
    		playRange,
    		handleProgressClick,
    		setSpeed,
    		toggleSkipInactive,
    		triggerUpdateMeta
    	});

    	$$self.$inject_state = $$props => {
    		if ('replayer' in $$props) $$invalidate(17, replayer = $$props.replayer);
    		if ('showController' in $$props) $$invalidate(2, showController = $$props.showController);
    		if ('autoPlay' in $$props) $$invalidate(18, autoPlay = $$props.autoPlay);
    		if ('skipInactive' in $$props) $$invalidate(0, skipInactive = $$props.skipInactive);
    		if ('speedOption' in $$props) $$invalidate(3, speedOption = $$props.speedOption);
    		if ('speed' in $$props) $$invalidate(1, speed = $$props.speed);
    		if ('tags' in $$props) $$invalidate(19, tags = $$props.tags);
    		if ('inactiveColor' in $$props) $$invalidate(20, inactiveColor = $$props.inactiveColor);
    		if ('currentTime' in $$props) $$invalidate(6, currentTime = $$props.currentTime);
    		if ('timer' in $$props) timer = $$props.timer;
    		if ('playerState' in $$props) $$invalidate(7, playerState = $$props.playerState);
    		if ('speedState' in $$props) $$invalidate(10, speedState = $$props.speedState);
    		if ('progress' in $$props) $$invalidate(11, progress = $$props.progress);
    		if ('step' in $$props) $$invalidate(12, step = $$props.step);
    		if ('finished' in $$props) finished = $$props.finished;
    		if ('pauseAt' in $$props) pauseAt = $$props.pauseAt;
    		if ('onPauseHook' in $$props) onPauseHook = $$props.onPauseHook;
    		if ('loop' in $$props) loop = $$props.loop;
    		if ('meta' in $$props) $$invalidate(8, meta = $$props.meta);
    		if ('percentage' in $$props) $$invalidate(13, percentage = $$props.percentage);
    		if ('customEvents' in $$props) $$invalidate(9, customEvents = $$props.customEvents);
    		if ('inactivePeriods' in $$props) $$invalidate(14, inactivePeriods = $$props.inactivePeriods);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*currentTime*/ 64) {
    			{
    				dispatch('ui-update-current-time', { payload: currentTime });
    			}
    		}

    		if ($$self.$$.dirty[0] & /*playerState*/ 128) {
    			{
    				dispatch('ui-update-player-state', { payload: playerState });
    			}
    		}

    		if ($$self.$$.dirty[0] & /*replayer*/ 131072) {
    			$$invalidate(8, meta = replayer.getMetaData());
    		}

    		if ($$self.$$.dirty[0] & /*currentTime, meta*/ 320) {
    			{
    				const percent = Math.min(1, currentTime / meta.totalTime);
    				$$invalidate(13, percentage = `${100 * percent}%`);
    				dispatch('ui-update-progress', { payload: percent });
    			}
    		}

    		if ($$self.$$.dirty[0] & /*replayer, tags*/ 655360) {
    			$$invalidate(9, customEvents = (() => {
    				const { context } = replayer.service.state;
    				const totalEvents = context.events.length;
    				const start = context.events[0].timestamp;
    				const end = context.events[totalEvents - 1].timestamp;
    				const customEvents = [];

    				// loop through all the events and find out custom event.
    				context.events.forEach(event => {
    					/**
     * we are only interested in custom event and calculate it's position
     * to place it in player's timeline.
     */
    					if (event.type === EventType.Custom) {
    						const customEvent = {
    							name: event.data.tag,
    							background: tags[event.data.tag] || 'rgb(73, 80, 246)',
    							position: `${position(start, end, event.timestamp)}%`
    						};

    						customEvents.push(customEvent);
    					}
    				});

    				return customEvents;
    			})());
    		}

    		if ($$self.$$.dirty[0] & /*replayer, inactiveColor*/ 1179648) {
    			$$invalidate(14, inactivePeriods = (() => {
    				try {
    					const { context } = replayer.service.state;
    					const totalEvents = context.events.length;
    					const start = context.events[0].timestamp;
    					const end = context.events[totalEvents - 1].timestamp;
    					const periods = getInactivePeriods(context.events);

    					// calculate the indicator width.
    					const getWidth = (startTime, endTime, tagStart, tagEnd) => {
    						const sessionDuration = endTime - startTime;
    						const eventDuration = tagEnd - tagStart;
    						const width = eventDuration / sessionDuration * 100;
    						return width.toFixed(2);
    					};

    					return periods.map(period => ({
    						name: 'inactive period',
    						background: inactiveColor,
    						position: `${position(start, end, period[0])}%`,
    						width: `${getWidth(start, end, period[0], period[1])}%`
    					}));
    				} catch(e) {
    					// For safety concern, if there is any error, the main function won't be affected.
    					return [];
    				}
    			})());
    		}
    	};

    	return [
    		skipInactive,
    		speed,
    		showController,
    		speedOption,
    		toggle,
    		setSpeed,
    		currentTime,
    		playerState,
    		meta,
    		customEvents,
    		speedState,
    		progress,
    		step,
    		percentage,
    		inactivePeriods,
    		dispatch,
    		handleProgressClick,
    		replayer,
    		autoPlay,
    		tags,
    		inactiveColor,
    		play,
    		pause,
    		goto,
    		playRange,
    		toggleSkipInactive,
    		triggerUpdateMeta,
    		div0_binding,
    		div2_binding,
    		click_handler,
    		switch_1_checked_binding,
    		click_handler_1
    	];
    }

    class Controller extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$1,
    			create_fragment$1,
    			safe_not_equal,
    			{
    				replayer: 17,
    				showController: 2,
    				autoPlay: 18,
    				skipInactive: 0,
    				speedOption: 3,
    				speed: 1,
    				tags: 19,
    				inactiveColor: 20,
    				toggle: 4,
    				play: 21,
    				pause: 22,
    				goto: 23,
    				playRange: 24,
    				setSpeed: 5,
    				toggleSkipInactive: 25,
    				triggerUpdateMeta: 26
    			},
    			null,
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Controller",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get replayer() {
    		throw new Error("<Controller>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set replayer(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get showController() {
    		throw new Error("<Controller>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showController(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get autoPlay() {
    		throw new Error("<Controller>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set autoPlay(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get skipInactive() {
    		throw new Error("<Controller>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set skipInactive(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get speedOption() {
    		throw new Error("<Controller>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set speedOption(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get speed() {
    		throw new Error("<Controller>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set speed(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get tags() {
    		throw new Error("<Controller>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set tags(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get inactiveColor() {
    		throw new Error("<Controller>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set inactiveColor(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get toggle() {
    		return this.$$.ctx[4];
    	}

    	set toggle(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get play() {
    		return this.$$.ctx[21];
    	}

    	set play(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get pause() {
    		return this.$$.ctx[22];
    	}

    	set pause(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get goto() {
    		return this.$$.ctx[23];
    	}

    	set goto(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get playRange() {
    		return this.$$.ctx[24];
    	}

    	set playRange(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get setSpeed() {
    		return this.$$.ctx[5];
    	}

    	set setSpeed(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get toggleSkipInactive() {
    		return this.$$.ctx[25];
    	}

    	set toggleSkipInactive(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get triggerUpdateMeta() {
    		return this.$$.ctx[26];
    	}

    	set triggerUpdateMeta(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Player.svelte generated by Svelte v3.59.2 */

    const { Error: Error_1 } = globals;
    const file = "src/Player.svelte";

    // (169:2) {#if replayer}
    function create_if_block(ctx) {
    	let controller_1;
    	let current;

    	let controller_1_props = {
    		replayer: /*replayer*/ ctx[7],
    		showController: /*showController*/ ctx[3],
    		autoPlay: /*autoPlay*/ ctx[1],
    		speedOption: /*speedOption*/ ctx[2],
    		skipInactive: /*skipInactive*/ ctx[0],
    		tags: /*tags*/ ctx[4],
    		inactiveColor: /*inactiveColor*/ ctx[5]
    	};

    	controller_1 = new Controller({
    			props: controller_1_props,
    			$$inline: true
    		});

    	/*controller_1_binding*/ ctx[32](controller_1);
    	controller_1.$on("fullscreen", /*fullscreen_handler*/ ctx[33]);

    	const block = {
    		c: function create() {
    			create_component(controller_1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(controller_1, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const controller_1_changes = {};
    			if (dirty[0] & /*replayer*/ 128) controller_1_changes.replayer = /*replayer*/ ctx[7];
    			if (dirty[0] & /*showController*/ 8) controller_1_changes.showController = /*showController*/ ctx[3];
    			if (dirty[0] & /*autoPlay*/ 2) controller_1_changes.autoPlay = /*autoPlay*/ ctx[1];
    			if (dirty[0] & /*speedOption*/ 4) controller_1_changes.speedOption = /*speedOption*/ ctx[2];
    			if (dirty[0] & /*skipInactive*/ 1) controller_1_changes.skipInactive = /*skipInactive*/ ctx[0];
    			if (dirty[0] & /*tags*/ 16) controller_1_changes.tags = /*tags*/ ctx[4];
    			if (dirty[0] & /*inactiveColor*/ 32) controller_1_changes.inactiveColor = /*inactiveColor*/ ctx[5];
    			controller_1.$set(controller_1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(controller_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(controller_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			/*controller_1_binding*/ ctx[32](null);
    			destroy_component(controller_1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(169:2) {#if replayer}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let div1;
    	let div0;
    	let t;
    	let current;
    	let if_block = /*replayer*/ ctx[7] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			t = space();
    			if (if_block) if_block.c();
    			attr_dev(div0, "class", "rr-player__frame");
    			attr_dev(div0, "style", /*style*/ ctx[11]);
    			add_location(div0, file, 167, 2, 6953);
    			attr_dev(div1, "class", "rr-player");
    			attr_dev(div1, "style", /*playerStyle*/ ctx[12]);
    			add_location(div1, file, 166, 0, 6888);
    		},
    		l: function claim(nodes) {
    			throw new Error_1("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			/*div0_binding*/ ctx[31](div0);
    			append_dev(div1, t);
    			if (if_block) if_block.m(div1, null);
    			/*div1_binding*/ ctx[34](div1);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty[0] & /*style*/ 2048) {
    				attr_dev(div0, "style", /*style*/ ctx[11]);
    			}

    			if (/*replayer*/ ctx[7]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*replayer*/ 128) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div1, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty[0] & /*playerStyle*/ 4096) {
    				attr_dev(div1, "style", /*playerStyle*/ ctx[12]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			/*div0_binding*/ ctx[31](null);
    			if (if_block) if_block.d();
    			/*div1_binding*/ ctx[34](null);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const controllerHeight = 80;

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Player', slots, []);
    	let { width = 1024 } = $$props;
    	let { height = 576 } = $$props;
    	let { maxScale = 1 } = $$props;
    	let { events = [] } = $$props;
    	let { skipInactive = true } = $$props;
    	let { autoPlay = true } = $$props;
    	let { speedOption = [1, 2, 4, 8] } = $$props;
    	let { speed = 1 } = $$props;
    	let { showController = true } = $$props;
    	let { tags = {} } = $$props;
    	let { inactiveColor = '#D4D4D4' } = $$props;
    	let replayer;
    	const getMirror = () => replayer.getMirror();
    	let player;
    	let frame;
    	let fullscreenListener;
    	let _width = width;
    	let _height = height;
    	let controller;
    	let style;
    	let playerStyle;

    	const updateScale = (el, frameDimension) => {
    		const widthScale = width / frameDimension.width;
    		const heightScale = height / frameDimension.height;
    		const scale = [widthScale, heightScale];
    		if (maxScale) scale.push(maxScale);
    		el.style.transform = `scale(${Math.min(...scale)})` + 'translate(-50%, -50%)';
    	};

    	const triggerResize = () => {
    		updateScale(replayer.wrapper, {
    			width: replayer.iframe.offsetWidth,
    			height: replayer.iframe.offsetHeight
    		});
    	};

    	const toggleFullscreen = () => {
    		if (player) {
    			isFullscreen()
    			? exitFullscreen()
    			: openFullscreen(player);
    		}
    	};

    	const addEventListener = (event, handler) => {
    		replayer.on(event, handler);

    		switch (event) {
    			case 'ui-update-current-time':
    			case 'ui-update-progress':
    			case 'ui-update-player-state':
    				controller.$on(event, ({ detail }) => handler(detail));
    		}
    	};

    	const addEvent = event => {
    		replayer.addEvent(event);
    		controller.triggerUpdateMeta();
    	};

    	const getMetaData = () => replayer.getMetaData();
    	const getReplayer = () => replayer;

    	const toggle = () => {
    		controller.toggle();
    	};

    	const setSpeed = speed => {
    		controller.setSpeed(speed);
    	};

    	const toggleSkipInactive = () => {
    		controller.toggleSkipInactive();
    	};

    	const play = () => {
    		controller.play();
    	};

    	const pause = () => {
    		controller.pause();
    	};

    	const goto = (timeOffset, play) => {
    		controller.goto(timeOffset, play);
    	};

    	const playRange = (timeOffset, endTimeOffset, startLooping = false, afterHook = undefined) => {
    		controller.playRange(timeOffset, endTimeOffset, startLooping, afterHook);
    	};

    	onMount(() => {
    		// runtime type check
    		if (speedOption !== undefined && typeOf(speedOption) !== 'array') {
    			throw new Error('speedOption must be array');
    		}

    		speedOption.forEach(item => {
    			if (typeOf(item) !== 'number') {
    				throw new Error('item of speedOption must be number');
    			}
    		});

    		if (speedOption.indexOf(speed) < 0) {
    			throw new Error(`speed must be one of speedOption,
        current config:
        {
          ...
          speed: ${speed},
          speedOption: [${speedOption.toString()}]
          ...
        }
        `);
    		}

    		$$invalidate(7, replayer = new Replayer(events, Object.assign({ speed, root: frame, unpackFn: unpack }, $$props)));

    		replayer.on('resize', dimension => {
    			updateScale(replayer.wrapper, dimension);
    		});

    		fullscreenListener = onFullscreenChange(() => {
    			if (isFullscreen()) {
    				setTimeout(
    					() => {
    						_width = width;
    						_height = height;
    						$$invalidate(13, width = player.offsetWidth);
    						$$invalidate(14, height = player.offsetHeight - (showController ? controllerHeight : 0));

    						updateScale(replayer.wrapper, {
    							width: replayer.iframe.offsetWidth,
    							height: replayer.iframe.offsetHeight
    						});
    					},
    					0
    				);
    			} else {
    				$$invalidate(13, width = _width);
    				$$invalidate(14, height = _height);

    				updateScale(replayer.wrapper, {
    					width: replayer.iframe.offsetWidth,
    					height: replayer.iframe.offsetHeight
    				});
    			}
    		});
    	});

    	onDestroy(() => {
    		fullscreenListener && fullscreenListener();
    	});

    	function div0_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			frame = $$value;
    			$$invalidate(9, frame);
    		});
    	}

    	function controller_1_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			controller = $$value;
    			$$invalidate(10, controller);
    		});
    	}

    	const fullscreen_handler = () => toggleFullscreen();

    	function div1_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			player = $$value;
    			$$invalidate(8, player);
    		});
    	}

    	$$self.$$set = $$new_props => {
    		$$invalidate(39, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('width' in $$new_props) $$invalidate(13, width = $$new_props.width);
    		if ('height' in $$new_props) $$invalidate(14, height = $$new_props.height);
    		if ('maxScale' in $$new_props) $$invalidate(15, maxScale = $$new_props.maxScale);
    		if ('events' in $$new_props) $$invalidate(16, events = $$new_props.events);
    		if ('skipInactive' in $$new_props) $$invalidate(0, skipInactive = $$new_props.skipInactive);
    		if ('autoPlay' in $$new_props) $$invalidate(1, autoPlay = $$new_props.autoPlay);
    		if ('speedOption' in $$new_props) $$invalidate(2, speedOption = $$new_props.speedOption);
    		if ('speed' in $$new_props) $$invalidate(17, speed = $$new_props.speed);
    		if ('showController' in $$new_props) $$invalidate(3, showController = $$new_props.showController);
    		if ('tags' in $$new_props) $$invalidate(4, tags = $$new_props.tags);
    		if ('inactiveColor' in $$new_props) $$invalidate(5, inactiveColor = $$new_props.inactiveColor);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		onDestroy,
    		Replayer,
    		unpack,
    		inlineCss,
    		openFullscreen,
    		exitFullscreen,
    		isFullscreen,
    		onFullscreenChange,
    		typeOf,
    		Controller,
    		width,
    		height,
    		maxScale,
    		events,
    		skipInactive,
    		autoPlay,
    		speedOption,
    		speed,
    		showController,
    		tags,
    		inactiveColor,
    		replayer,
    		getMirror,
    		controllerHeight,
    		player,
    		frame,
    		fullscreenListener,
    		_width,
    		_height,
    		controller,
    		style,
    		playerStyle,
    		updateScale,
    		triggerResize,
    		toggleFullscreen,
    		addEventListener,
    		addEvent,
    		getMetaData,
    		getReplayer,
    		toggle,
    		setSpeed,
    		toggleSkipInactive,
    		play,
    		pause,
    		goto,
    		playRange
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(39, $$props = assign(assign({}, $$props), $$new_props));
    		if ('width' in $$props) $$invalidate(13, width = $$new_props.width);
    		if ('height' in $$props) $$invalidate(14, height = $$new_props.height);
    		if ('maxScale' in $$props) $$invalidate(15, maxScale = $$new_props.maxScale);
    		if ('events' in $$props) $$invalidate(16, events = $$new_props.events);
    		if ('skipInactive' in $$props) $$invalidate(0, skipInactive = $$new_props.skipInactive);
    		if ('autoPlay' in $$props) $$invalidate(1, autoPlay = $$new_props.autoPlay);
    		if ('speedOption' in $$props) $$invalidate(2, speedOption = $$new_props.speedOption);
    		if ('speed' in $$props) $$invalidate(17, speed = $$new_props.speed);
    		if ('showController' in $$props) $$invalidate(3, showController = $$new_props.showController);
    		if ('tags' in $$props) $$invalidate(4, tags = $$new_props.tags);
    		if ('inactiveColor' in $$props) $$invalidate(5, inactiveColor = $$new_props.inactiveColor);
    		if ('replayer' in $$props) $$invalidate(7, replayer = $$new_props.replayer);
    		if ('player' in $$props) $$invalidate(8, player = $$new_props.player);
    		if ('frame' in $$props) $$invalidate(9, frame = $$new_props.frame);
    		if ('fullscreenListener' in $$props) fullscreenListener = $$new_props.fullscreenListener;
    		if ('_width' in $$props) _width = $$new_props._width;
    		if ('_height' in $$props) _height = $$new_props._height;
    		if ('controller' in $$props) $$invalidate(10, controller = $$new_props.controller);
    		if ('style' in $$props) $$invalidate(11, style = $$new_props.style);
    		if ('playerStyle' in $$props) $$invalidate(12, playerStyle = $$new_props.playerStyle);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*width, height*/ 24576) {
    			$$invalidate(11, style = inlineCss({
    				width: `${width}px`,
    				height: `${height}px`
    			}));
    		}

    		if ($$self.$$.dirty[0] & /*width, height, showController*/ 24584) {
    			$$invalidate(12, playerStyle = inlineCss({
    				width: `${width}px`,
    				height: `${height + (showController ? controllerHeight : 0)}px`
    			}));
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		skipInactive,
    		autoPlay,
    		speedOption,
    		showController,
    		tags,
    		inactiveColor,
    		toggleFullscreen,
    		replayer,
    		player,
    		frame,
    		controller,
    		style,
    		playerStyle,
    		width,
    		height,
    		maxScale,
    		events,
    		speed,
    		getMirror,
    		triggerResize,
    		addEventListener,
    		addEvent,
    		getMetaData,
    		getReplayer,
    		toggle,
    		setSpeed,
    		toggleSkipInactive,
    		play,
    		pause,
    		goto,
    		playRange,
    		div0_binding,
    		controller_1_binding,
    		fullscreen_handler,
    		div1_binding
    	];
    }

    class Player$1 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance,
    			create_fragment,
    			safe_not_equal,
    			{
    				width: 13,
    				height: 14,
    				maxScale: 15,
    				events: 16,
    				skipInactive: 0,
    				autoPlay: 1,
    				speedOption: 2,
    				speed: 17,
    				showController: 3,
    				tags: 4,
    				inactiveColor: 5,
    				getMirror: 18,
    				triggerResize: 19,
    				toggleFullscreen: 6,
    				addEventListener: 20,
    				addEvent: 21,
    				getMetaData: 22,
    				getReplayer: 23,
    				toggle: 24,
    				setSpeed: 25,
    				toggleSkipInactive: 26,
    				play: 27,
    				pause: 28,
    				goto: 29,
    				playRange: 30
    			},
    			null,
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Player",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get width() {
    		throw new Error_1("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set width(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get height() {
    		throw new Error_1("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set height(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get maxScale() {
    		throw new Error_1("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set maxScale(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get events() {
    		throw new Error_1("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set events(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get skipInactive() {
    		throw new Error_1("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set skipInactive(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get autoPlay() {
    		throw new Error_1("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set autoPlay(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get speedOption() {
    		throw new Error_1("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set speedOption(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get speed() {
    		throw new Error_1("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set speed(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get showController() {
    		throw new Error_1("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showController(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get tags() {
    		throw new Error_1("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set tags(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get inactiveColor() {
    		throw new Error_1("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set inactiveColor(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get getMirror() {
    		return this.$$.ctx[18];
    	}

    	set getMirror(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get triggerResize() {
    		return this.$$.ctx[19];
    	}

    	set triggerResize(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get toggleFullscreen() {
    		return this.$$.ctx[6];
    	}

    	set toggleFullscreen(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get addEventListener() {
    		return this.$$.ctx[20];
    	}

    	set addEventListener(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get addEvent() {
    		return this.$$.ctx[21];
    	}

    	set addEvent(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get getMetaData() {
    		return this.$$.ctx[22];
    	}

    	set getMetaData(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get getReplayer() {
    		return this.$$.ctx[23];
    	}

    	set getReplayer(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get toggle() {
    		return this.$$.ctx[24];
    	}

    	set toggle(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get setSpeed() {
    		return this.$$.ctx[25];
    	}

    	set setSpeed(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get toggleSkipInactive() {
    		return this.$$.ctx[26];
    	}

    	set toggleSkipInactive(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get play() {
    		return this.$$.ctx[27];
    	}

    	set play(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get pause() {
    		return this.$$.ctx[28];
    	}

    	set pause(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get goto() {
    		return this.$$.ctx[29];
    	}

    	set goto(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get playRange() {
    		return this.$$.ctx[30];
    	}

    	set playRange(value) {
    		throw new Error_1("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    class Player extends Player$1 {
        constructor(options) {
            super({
                target: options.target,
                props: options.data || options.props,
            });
        }
    }

    return Player;

})();
//# sourceMappingURL=bundle.js.map
