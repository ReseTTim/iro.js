/*!
 * iro.js v4.0.0-alpha
 * 2016-2018 James Daniel
 * Released under the MIT License
 * github.com/jaames/iro.js
 */

(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.iro = factory());
}(this, (function () { 'use strict';

	var VNode = function VNode() {};

	var options = {};

	var stack = [];

	var EMPTY_CHILDREN = [];

	function h(nodeName, attributes) {
		var children = EMPTY_CHILDREN,
		    lastSimple,
		    child,
		    simple,
		    i;
		for (i = arguments.length; i-- > 2;) {
			stack.push(arguments[i]);
		}
		if (attributes && attributes.children != null) {
			if (!stack.length) stack.push(attributes.children);
			delete attributes.children;
		}
		while (stack.length) {
			if ((child = stack.pop()) && child.pop !== undefined) {
				for (i = child.length; i--;) {
					stack.push(child[i]);
				}
			} else {
				if (typeof child === 'boolean') child = null;

				if (simple = typeof nodeName !== 'function') {
					if (child == null) child = '';else if (typeof child === 'number') child = String(child);else if (typeof child !== 'string') simple = false;
				}

				if (simple && lastSimple) {
					children[children.length - 1] += child;
				} else if (children === EMPTY_CHILDREN) {
					children = [child];
				} else {
					children.push(child);
				}

				lastSimple = simple;
			}
		}

		var p = new VNode();
		p.nodeName = nodeName;
		p.children = children;
		p.attributes = attributes == null ? undefined : attributes;
		p.key = attributes == null ? undefined : attributes.key;

		if (options.vnode !== undefined) options.vnode(p);

		return p;
	}

	function extend(obj, props) {
	  for (var i in props) {
	    obj[i] = props[i];
	  }return obj;
	}

	var defer = typeof Promise == 'function' ? Promise.resolve().then.bind(Promise.resolve()) : setTimeout;

	var IS_NON_DIMENSIONAL = /acit|ex(?:s|g|n|p|$)|rph|ows|mnc|ntw|ine[ch]|zoo|^ord/i;

	var items = [];

	function enqueueRender(component) {
		if (!component._dirty && (component._dirty = true) && items.push(component) == 1) {
			(options.debounceRendering || defer)(rerender);
		}
	}

	function rerender() {
		var p,
		    list = items;
		items = [];
		while (p = list.pop()) {
			if (p._dirty) renderComponent(p);
		}
	}

	function isSameNodeType(node, vnode, hydrating) {
		if (typeof vnode === 'string' || typeof vnode === 'number') {
			return node.splitText !== undefined;
		}
		if (typeof vnode.nodeName === 'string') {
			return !node._componentConstructor && isNamedNode(node, vnode.nodeName);
		}
		return hydrating || node._componentConstructor === vnode.nodeName;
	}

	function isNamedNode(node, nodeName) {
		return node.normalizedNodeName === nodeName || node.nodeName.toLowerCase() === nodeName.toLowerCase();
	}

	function getNodeProps(vnode) {
		var props = extend({}, vnode.attributes);
		props.children = vnode.children;

		var defaultProps = vnode.nodeName.defaultProps;
		if (defaultProps !== undefined) {
			for (var i in defaultProps) {
				if (props[i] === undefined) {
					props[i] = defaultProps[i];
				}
			}
		}

		return props;
	}

	function createNode(nodeName, isSvg) {
		var node = isSvg ? document.createElementNS('http://www.w3.org/2000/svg', nodeName) : document.createElement(nodeName);
		node.normalizedNodeName = nodeName;
		return node;
	}

	function removeNode(node) {
		var parentNode = node.parentNode;
		if (parentNode) parentNode.removeChild(node);
	}

	function setAccessor(node, name, old, value, isSvg) {
		if (name === 'className') name = 'class';

		if (name === 'key') {} else if (name === 'ref') {
			if (old) old(null);
			if (value) value(node);
		} else if (name === 'class' && !isSvg) {
			node.className = value || '';
		} else if (name === 'style') {
			if (!value || typeof value === 'string' || typeof old === 'string') {
				node.style.cssText = value || '';
			}
			if (value && typeof value === 'object') {
				if (typeof old !== 'string') {
					for (var i in old) {
						if (!(i in value)) node.style[i] = '';
					}
				}
				for (var i in value) {
					node.style[i] = typeof value[i] === 'number' && IS_NON_DIMENSIONAL.test(i) === false ? value[i] + 'px' : value[i];
				}
			}
		} else if (name === 'dangerouslySetInnerHTML') {
			if (value) node.innerHTML = value.__html || '';
		} else if (name[0] == 'o' && name[1] == 'n') {
			var useCapture = name !== (name = name.replace(/Capture$/, ''));
			name = name.toLowerCase().substring(2);
			if (value) {
				if (!old) node.addEventListener(name, eventProxy, useCapture);
			} else {
				node.removeEventListener(name, eventProxy, useCapture);
			}
			(node._listeners || (node._listeners = {}))[name] = value;
		} else if (name !== 'list' && name !== 'type' && !isSvg && name in node) {
			try {
				node[name] = value == null ? '' : value;
			} catch (e) {}
			if ((value == null || value === false) && name != 'spellcheck') node.removeAttribute(name);
		} else {
			var ns = isSvg && name !== (name = name.replace(/^xlink:?/, ''));

			if (value == null || value === false) {
				if (ns) node.removeAttributeNS('http://www.w3.org/1999/xlink', name.toLowerCase());else node.removeAttribute(name);
			} else if (typeof value !== 'function') {
				if (ns) node.setAttributeNS('http://www.w3.org/1999/xlink', name.toLowerCase(), value);else node.setAttribute(name, value);
			}
		}
	}

	function eventProxy(e) {
		return this._listeners[e.type](options.event && options.event(e) || e);
	}

	var mounts = [];

	var diffLevel = 0;

	var isSvgMode = false;

	var hydrating = false;

	function flushMounts() {
		var c;
		while (c = mounts.pop()) {
			if (options.afterMount) options.afterMount(c);
			if (c.componentDidMount) c.componentDidMount();
		}
	}

	function diff(dom, vnode, context, mountAll, parent, componentRoot) {
		if (!diffLevel++) {
			isSvgMode = parent != null && parent.ownerSVGElement !== undefined;

			hydrating = dom != null && !('__preactattr_' in dom);
		}

		var ret = idiff(dom, vnode, context, mountAll, componentRoot);

		if (parent && ret.parentNode !== parent) parent.appendChild(ret);

		if (! --diffLevel) {
			hydrating = false;

			if (!componentRoot) flushMounts();
		}

		return ret;
	}

	function idiff(dom, vnode, context, mountAll, componentRoot) {
		var out = dom,
		    prevSvgMode = isSvgMode;

		if (vnode == null || typeof vnode === 'boolean') vnode = '';

		if (typeof vnode === 'string' || typeof vnode === 'number') {
			if (dom && dom.splitText !== undefined && dom.parentNode && (!dom._component || componentRoot)) {
				if (dom.nodeValue != vnode) {
					dom.nodeValue = vnode;
				}
			} else {
				out = document.createTextNode(vnode);
				if (dom) {
					if (dom.parentNode) dom.parentNode.replaceChild(out, dom);
					recollectNodeTree(dom, true);
				}
			}

			out['__preactattr_'] = true;

			return out;
		}

		var vnodeName = vnode.nodeName;
		if (typeof vnodeName === 'function') {
			return buildComponentFromVNode(dom, vnode, context, mountAll);
		}

		isSvgMode = vnodeName === 'svg' ? true : vnodeName === 'foreignObject' ? false : isSvgMode;

		vnodeName = String(vnodeName);
		if (!dom || !isNamedNode(dom, vnodeName)) {
			out = createNode(vnodeName, isSvgMode);

			if (dom) {
				while (dom.firstChild) {
					out.appendChild(dom.firstChild);
				}
				if (dom.parentNode) dom.parentNode.replaceChild(out, dom);

				recollectNodeTree(dom, true);
			}
		}

		var fc = out.firstChild,
		    props = out['__preactattr_'],
		    vchildren = vnode.children;

		if (props == null) {
			props = out['__preactattr_'] = {};
			for (var a = out.attributes, i = a.length; i--;) {
				props[a[i].name] = a[i].value;
			}
		}

		if (!hydrating && vchildren && vchildren.length === 1 && typeof vchildren[0] === 'string' && fc != null && fc.splitText !== undefined && fc.nextSibling == null) {
			if (fc.nodeValue != vchildren[0]) {
				fc.nodeValue = vchildren[0];
			}
		} else if (vchildren && vchildren.length || fc != null) {
				innerDiffNode(out, vchildren, context, mountAll, hydrating || props.dangerouslySetInnerHTML != null);
			}

		diffAttributes(out, vnode.attributes, props);

		isSvgMode = prevSvgMode;

		return out;
	}

	function innerDiffNode(dom, vchildren, context, mountAll, isHydrating) {
		var originalChildren = dom.childNodes,
		    children = [],
		    keyed = {},
		    keyedLen = 0,
		    min = 0,
		    len = originalChildren.length,
		    childrenLen = 0,
		    vlen = vchildren ? vchildren.length : 0,
		    j,
		    c,
		    f,
		    vchild,
		    child;

		if (len !== 0) {
			for (var i = 0; i < len; i++) {
				var _child = originalChildren[i],
				    props = _child['__preactattr_'],
				    key = vlen && props ? _child._component ? _child._component.__key : props.key : null;
				if (key != null) {
					keyedLen++;
					keyed[key] = _child;
				} else if (props || (_child.splitText !== undefined ? isHydrating ? _child.nodeValue.trim() : true : isHydrating)) {
					children[childrenLen++] = _child;
				}
			}
		}

		if (vlen !== 0) {
			for (var i = 0; i < vlen; i++) {
				vchild = vchildren[i];
				child = null;

				var key = vchild.key;
				if (key != null) {
					if (keyedLen && keyed[key] !== undefined) {
						child = keyed[key];
						keyed[key] = undefined;
						keyedLen--;
					}
				} else if (min < childrenLen) {
						for (j = min; j < childrenLen; j++) {
							if (children[j] !== undefined && isSameNodeType(c = children[j], vchild, isHydrating)) {
								child = c;
								children[j] = undefined;
								if (j === childrenLen - 1) childrenLen--;
								if (j === min) min++;
								break;
							}
						}
					}

				child = idiff(child, vchild, context, mountAll);

				f = originalChildren[i];
				if (child && child !== dom && child !== f) {
					if (f == null) {
						dom.appendChild(child);
					} else if (child === f.nextSibling) {
						removeNode(f);
					} else {
						dom.insertBefore(child, f);
					}
				}
			}
		}

		if (keyedLen) {
			for (var i in keyed) {
				if (keyed[i] !== undefined) recollectNodeTree(keyed[i], false);
			}
		}

		while (min <= childrenLen) {
			if ((child = children[childrenLen--]) !== undefined) recollectNodeTree(child, false);
		}
	}

	function recollectNodeTree(node, unmountOnly) {
		var component = node._component;
		if (component) {
			unmountComponent(component);
		} else {
			if (node['__preactattr_'] != null && node['__preactattr_'].ref) node['__preactattr_'].ref(null);

			if (unmountOnly === false || node['__preactattr_'] == null) {
				removeNode(node);
			}

			removeChildren(node);
		}
	}

	function removeChildren(node) {
		node = node.lastChild;
		while (node) {
			var next = node.previousSibling;
			recollectNodeTree(node, true);
			node = next;
		}
	}

	function diffAttributes(dom, attrs, old) {
		var name;

		for (name in old) {
			if (!(attrs && attrs[name] != null) && old[name] != null) {
				setAccessor(dom, name, old[name], old[name] = undefined, isSvgMode);
			}
		}

		for (name in attrs) {
			if (name !== 'children' && name !== 'innerHTML' && (!(name in old) || attrs[name] !== (name === 'value' || name === 'checked' ? dom[name] : old[name]))) {
				setAccessor(dom, name, old[name], old[name] = attrs[name], isSvgMode);
			}
		}
	}

	var recyclerComponents = [];

	function createComponent(Ctor, props, context) {
		var inst,
		    i = recyclerComponents.length;

		if (Ctor.prototype && Ctor.prototype.render) {
			inst = new Ctor(props, context);
			Component.call(inst, props, context);
		} else {
			inst = new Component(props, context);
			inst.constructor = Ctor;
			inst.render = doRender;
		}

		while (i--) {
			if (recyclerComponents[i].constructor === Ctor) {
				inst.nextBase = recyclerComponents[i].nextBase;
				recyclerComponents.splice(i, 1);
				return inst;
			}
		}

		return inst;
	}

	function doRender(props, state, context) {
		return this.constructor(props, context);
	}

	function setComponentProps(component, props, renderMode, context, mountAll) {
		if (component._disable) return;
		component._disable = true;

		component.__ref = props.ref;
		component.__key = props.key;
		delete props.ref;
		delete props.key;

		if (typeof component.constructor.getDerivedStateFromProps === 'undefined') {
			if (!component.base || mountAll) {
				if (component.componentWillMount) component.componentWillMount();
			} else if (component.componentWillReceiveProps) {
				component.componentWillReceiveProps(props, context);
			}
		}

		if (context && context !== component.context) {
			if (!component.prevContext) component.prevContext = component.context;
			component.context = context;
		}

		if (!component.prevProps) component.prevProps = component.props;
		component.props = props;

		component._disable = false;

		if (renderMode !== 0) {
			if (renderMode === 1 || options.syncComponentUpdates !== false || !component.base) {
				renderComponent(component, 1, mountAll);
			} else {
				enqueueRender(component);
			}
		}

		if (component.__ref) component.__ref(component);
	}

	function renderComponent(component, renderMode, mountAll, isChild) {
		if (component._disable) return;

		var props = component.props,
		    state = component.state,
		    context = component.context,
		    previousProps = component.prevProps || props,
		    previousState = component.prevState || state,
		    previousContext = component.prevContext || context,
		    isUpdate = component.base,
		    nextBase = component.nextBase,
		    initialBase = isUpdate || nextBase,
		    initialChildComponent = component._component,
		    skip = false,
		    snapshot = previousContext,
		    rendered,
		    inst,
		    cbase;

		if (component.constructor.getDerivedStateFromProps) {
			state = extend(extend({}, state), component.constructor.getDerivedStateFromProps(props, state));
			component.state = state;
		}

		if (isUpdate) {
			component.props = previousProps;
			component.state = previousState;
			component.context = previousContext;
			if (renderMode !== 2 && component.shouldComponentUpdate && component.shouldComponentUpdate(props, state, context) === false) {
				skip = true;
			} else if (component.componentWillUpdate) {
				component.componentWillUpdate(props, state, context);
			}
			component.props = props;
			component.state = state;
			component.context = context;
		}

		component.prevProps = component.prevState = component.prevContext = component.nextBase = null;
		component._dirty = false;

		if (!skip) {
			rendered = component.render(props, state, context);

			if (component.getChildContext) {
				context = extend(extend({}, context), component.getChildContext());
			}

			if (isUpdate && component.getSnapshotBeforeUpdate) {
				snapshot = component.getSnapshotBeforeUpdate(previousProps, previousState);
			}

			var childComponent = rendered && rendered.nodeName,
			    toUnmount,
			    base;

			if (typeof childComponent === 'function') {

				var childProps = getNodeProps(rendered);
				inst = initialChildComponent;

				if (inst && inst.constructor === childComponent && childProps.key == inst.__key) {
					setComponentProps(inst, childProps, 1, context, false);
				} else {
					toUnmount = inst;

					component._component = inst = createComponent(childComponent, childProps, context);
					inst.nextBase = inst.nextBase || nextBase;
					inst._parentComponent = component;
					setComponentProps(inst, childProps, 0, context, false);
					renderComponent(inst, 1, mountAll, true);
				}

				base = inst.base;
			} else {
				cbase = initialBase;

				toUnmount = initialChildComponent;
				if (toUnmount) {
					cbase = component._component = null;
				}

				if (initialBase || renderMode === 1) {
					if (cbase) cbase._component = null;
					base = diff(cbase, rendered, context, mountAll || !isUpdate, initialBase && initialBase.parentNode, true);
				}
			}

			if (initialBase && base !== initialBase && inst !== initialChildComponent) {
				var baseParent = initialBase.parentNode;
				if (baseParent && base !== baseParent) {
					baseParent.replaceChild(base, initialBase);

					if (!toUnmount) {
						initialBase._component = null;
						recollectNodeTree(initialBase, false);
					}
				}
			}

			if (toUnmount) {
				unmountComponent(toUnmount);
			}

			component.base = base;
			if (base && !isChild) {
				var componentRef = component,
				    t = component;
				while (t = t._parentComponent) {
					(componentRef = t).base = base;
				}
				base._component = componentRef;
				base._componentConstructor = componentRef.constructor;
			}
		}

		if (!isUpdate || mountAll) {
			mounts.unshift(component);
		} else if (!skip) {

			if (component.componentDidUpdate) {
				component.componentDidUpdate(previousProps, previousState, snapshot);
			}
			if (options.afterUpdate) options.afterUpdate(component);
		}

		while (component._renderCallbacks.length) {
			component._renderCallbacks.pop().call(component);
		}if (!diffLevel && !isChild) flushMounts();
	}

	function buildComponentFromVNode(dom, vnode, context, mountAll) {
		var c = dom && dom._component,
		    originalComponent = c,
		    oldDom = dom,
		    isDirectOwner = c && dom._componentConstructor === vnode.nodeName,
		    isOwner = isDirectOwner,
		    props = getNodeProps(vnode);
		while (c && !isOwner && (c = c._parentComponent)) {
			isOwner = c.constructor === vnode.nodeName;
		}

		if (c && isOwner && (!mountAll || c._component)) {
			setComponentProps(c, props, 3, context, mountAll);
			dom = c.base;
		} else {
			if (originalComponent && !isDirectOwner) {
				unmountComponent(originalComponent);
				dom = oldDom = null;
			}

			c = createComponent(vnode.nodeName, props, context);
			if (dom && !c.nextBase) {
				c.nextBase = dom;

				oldDom = null;
			}
			setComponentProps(c, props, 1, context, mountAll);
			dom = c.base;

			if (oldDom && dom !== oldDom) {
				oldDom._component = null;
				recollectNodeTree(oldDom, false);
			}
		}

		return dom;
	}

	function unmountComponent(component) {
		if (options.beforeUnmount) options.beforeUnmount(component);

		var base = component.base;

		component._disable = true;

		if (component.componentWillUnmount) component.componentWillUnmount();

		component.base = null;

		var inner = component._component;
		if (inner) {
			unmountComponent(inner);
		} else if (base) {
			if (base['__preactattr_'] && base['__preactattr_'].ref) base['__preactattr_'].ref(null);

			component.nextBase = base;

			removeNode(base);
			recyclerComponents.push(component);

			removeChildren(base);
		}

		if (component.__ref) component.__ref(null);
	}

	function Component(props, context) {
		this._dirty = true;

		this.context = context;

		this.props = props;

		this.state = this.state || {};

		this._renderCallbacks = [];
	}

	extend(Component.prototype, {
		setState: function setState(state, callback) {
			if (!this.prevState) this.prevState = this.state;
			this.state = extend(extend({}, this.state), typeof state === 'function' ? state(this.state, this.props) : state);
			if (callback) this._renderCallbacks.push(callback);
			enqueueRender(this);
		},
		forceUpdate: function forceUpdate(callback) {
			if (callback) this._renderCallbacks.push(callback);
			renderComponent(this, 2);
		},
		render: function render() {}
	});

	function render(vnode, parent, merge) {
	  return diff(merge, vnode, {}, false, parent, false);
	}
	//# sourceMappingURL=preact.mjs.map

	function _extends() {
	  _extends = Object.assign || function (target) {
	    for (var i = 1; i < arguments.length; i++) {
	      var source = arguments[i];

	      for (var key in source) {
	        if (Object.prototype.hasOwnProperty.call(source, key)) {
	          target[key] = source[key];
	        }
	      }
	    }

	    return target;
	  };

	  return _extends.apply(this, arguments);
	}

	/**
	  * @desc listen to one or more events on an element
	  * @param {Element} el target element
	  * @param {Array} eventList the events to listen to
	  * @param {Function} callback the event callback function
	  * @param {Object} params params to pass to addEventListener
	*/

	function listen(el, eventList, callback, params) {
	  if ( params === void 0 ) params = {};

	  for (var i = 0; i < eventList.length; i++) {
	    el.addEventListener(eventList[i], callback, params);
	  }
	}
	/**
	* @desc remove an event listener on an element
	* @param {Element} el target element
	* @param {Array} eventList the events to remove
	* @param {Function} callback the event callback function
	*/

	function unlisten(el, eventList, callback) {
	  for (var i = 0; i < eventList.length; i++) {
	    el.removeEventListener(eventList[i], callback);
	  }
	}

	var EVENT_MOUSEDOWN = "mousedown",
	      EVENT_MOUSEMOVE = "mousemove",
	      EVENT_MOUSEUP = "mouseup",
	      EVENT_TOUCHSTART = "touchstart",
	      EVENT_TOUCHMOVE = "touchmove",
	      EVENT_TOUCHEND = "touchend";
	var IroComponent = (function (Component$$1) {
	  function IroComponent () {
	    Component$$1.apply(this, arguments);
	  }

	  if ( Component$$1 ) IroComponent.__proto__ = Component$$1;
	  IroComponent.prototype = Object.create( Component$$1 && Component$$1.prototype );
	  IroComponent.prototype.constructor = IroComponent;

	  IroComponent.prototype.componentDidMount = function componentDidMount () {
	    if (this.root) { listen(this.root, [EVENT_MOUSEDOWN, EVENT_TOUCHSTART], this, {
	      passive: false
	    }); }
	  };

	  IroComponent.prototype.componentWillUnmount = function componentWillUnmount () {
	    if (this.root) { unlisten(this.root, [EVENT_MOUSEDOWN, EVENT_TOUCHSTART], this); }
	  };

	  IroComponent.prototype.handleEvent = function handleEvent (e) {
	    var ref = this;
	    var root = ref.root; // Detect if the event is a touch event by checking if it has the `touches` property
	    // If it is a touch event, use the first touch input

	    e.preventDefault();
	    var point = e.touches ? e.changedTouches[0] : e;
	    var x = point.clientX;
	    var y = point.clientY; // Get the screen position of the component

	    var rect = root.getBoundingClientRect();
	    var hsv;

	    switch (e.type) {
	      case EVENT_MOUSEDOWN:
	      case EVENT_TOUCHSTART:
	        listen(document, [EVENT_MOUSEMOVE, EVENT_TOUCHMOVE, EVENT_MOUSEUP, EVENT_TOUCHEND], this, {
	          passive: false
	        });
	        hsv = this.input(x, y, rect, "START"); // parent.emit("input:start", parent.color);

	        break;

	      case EVENT_MOUSEMOVE:
	      case EVENT_TOUCHMOVE:
	        // Use the position to update the picker color
	        hsv = this.input(x, y, rect, "MOVE");
	        break;

	      case EVENT_MOUSEUP:
	      case EVENT_TOUCHEND:
	        hsv = this.input(x, y, rect, "END"); // parent.emit("input:end", parent.color);

	        unlisten(document, [EVENT_MOUSEMOVE, EVENT_TOUCHMOVE, EVENT_MOUSEUP, EVENT_TOUCHEND], this);
	        break;
	    } // if (hsv) parent.color.hsv = hsv;

	  };

	  IroComponent.prototype.input = function input (x, y, rect, type) {};

	  return IroComponent;
	}(Component));

	function IroMarker(props) {
	  return h("svg", {
	    class: "iro__marker",
	    x: props.x,
	    y: props.y,
	    overflow: "visible"
	  }, h("circle", {
	    class: "iro__marker__outer",
	    x: 0,
	    y: 0,
	    r: props.r,
	    fill: "none",
	    "stroke-width": 5,
	    stroke: "#000"
	  }), h("circle", {
	    class: "iro__marker__inner",
	    x: 0,
	    y: 0,
	    r: props.r,
	    fill: "none",
	    "stroke-width": 7,
	    stroke: "#fff"
	  }));
	}
	IroMarker.defaultProps = {
	  x: 0,
	  y: 0,
	  r: 8
	};

	function arcPath(cx, cy, radius, startAngle, endAngle) {
	  var largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
	  startAngle *= Math.PI / 180;
	  endAngle *= Math.PI / 180;
	  var x1 = cx + radius * Math.cos(endAngle);
	  var y1 = cy + radius * Math.sin(endAngle);
	  var x2 = cx + radius * Math.cos(startAngle);
	  var y2 = cy + radius * Math.sin(startAngle);
	  return ["M", x1, y1, "A", radius, radius, 0, largeArcFlag, 0, x2, y2].join(" ");
	}

	var IroWheel = (function (IroComponent$$1) {
	  function IroWheel () {
	    IroComponent$$1.apply(this, arguments);
	  }

	  if ( IroComponent$$1 ) IroWheel.__proto__ = IroComponent$$1;
	  IroWheel.prototype = Object.create( IroComponent$$1 && IroComponent$$1.prototype );
	  IroWheel.prototype.constructor = IroWheel;

	  IroWheel.prototype.render = function render$$1 (props) {
	    var this$1 = this;

	    var hsv = props.hsv;
	    var markerAngle = (props.anticlockwise ? 360 - hsv.h : hsv.h) * (Math.PI / 180);
	    var markerDist = hsv.s / 100 * props.rMax;
	    var radius = props.radius;
	    var cX = 50;
	    var cY = 50;
	    return h("svg", {
	      class: "iro__wheel",
	      x: props.x,
	      y: props.y,
	      ref: function (el) { return this$1.root = el; }
	    }, h("defs", null, h("radialGradient", {
	      id: "iroGradient2"
	    }, h("stop", {
	      offset: "0%",
	      "stop-color": "#fff"
	    }), h("stop", {
	      offset: "100%",
	      "stop-color": "#fff",
	      "stop-opacity": 0
	    }))), h("circle", {
	      class: "iro__wheel__border",
	      cx: cX,
	      cy: cY,
	      r: radius,
	      fill: "none",
	      stroke: props.borderColor,
	      "stroke-width": props.borderWidth,
	      "vector-effect": "non-scaling-stroke"
	    }), h("g", {
	      class: "__hue",
	      "stroke-width": radius / 2,
	      fill: "none"
	    }, new Array(360).fill(0).map(function (_, hue) { return h("path", {
	      key: hue,
	      d: arcPath(cX, cY, radius, hue, hue + 1.5),
	      stroke: ("hsl(" + (props.anticlockwise ? 360 - hue : hue) + ", 100%, 50%)")
	    }); })), h("circle", {
	      class: "iro__wheel__saturation",
	      cx: cX,
	      cy: cY,
	      r: radius,
	      fill: "url(#iroGradient2)"
	    }), h("circle", {
	      class: "iro__wheel__lightness",
	      cx: cX,
	      cy: cY,
	      r: radius,
	      fill: "#000",
	      opacity: 1 - hsv.v / 100
	    }), h(IroMarker, {
	      r: props.markerRadius,
	      x: cX + markerDist * Math.cos(markerAngle),
	      y: cY + markerDist * Math.sin(markerAngle)
	    }));
	  };
	  /**
	    * @desc Takes a point at (x, y) and returns HSV values based on this input -- use this to update a color from mouse input
	    * @param {Number} x - point x coordinate
	    * @param {Number} y - point y coordinate
	    * @return {Object} - new HSV color values (some channels may be missing)
	  */


	  IroWheel.prototype.input = function input (x, y, rect, type) {
	    var props = this.props;
	    var rangeMax = 100;
	    var cX = rect.width / 2;
	    var cY = rect.height / 2;
	    x = cX - (x - rect.left);
	    y = cY - (y - rect.top);
	    var angle = Math.atan2(y, x); // Calculate the hue by converting the angle to radians

	    var hue = Math.round(angle * (180 / Math.PI)) + 180; // Find the point's distance from the center of the wheel
	    // This is used to show the saturation level

	    var dist = Math.min(Math.sqrt(x * x + y * y), rangeMax);
	    hue = props.anticlockwise ? 360 - hue : hue; // Return just the H and S channels, the wheel element doesn't do anything with the L channel

	    return {
	      h: hue,
	      s: Math.round(100 / rangeMax * dist)
	    };
	  };

	  return IroWheel;
	}(IroComponent));

	var round = Math.round;
	var floor = Math.floor;
	/**
	  * @desc generic parser for hsl / rgb / etc string
	  * @param {String} str - color string
	  * @param {Array} maxValues - max values for each channel (used for calculating percent-based values)
	  * @return {Array} type (rgb | rgba | hsl | hsla) values for each channel
	*/

	function parseColorStr(str, maxValues) {
	  var parsed = str.match(/(\S+)\((\d+)(%?)(?:\D+?)(\d+)(%?)(?:\D+?)(\d+)(%?)(?:\D+?)?([0-9\.]+?)?\)/i),
	      val1 = parseInt(parsed[2]),
	      val2 = parseInt(parsed[4]),
	      val3 = parseInt(parsed[6]);
	  return [parsed[1], parsed[3] == "%" ? val1 / 100 * maxValues[0] : val1, parsed[5] == "%" ? val2 / 100 * maxValues[1] : val2, parsed[7] == "%" ? val3 / 100 * maxValues[2] : val3, parseFloat(parsed[8]) || undefined];
	}
	/**
	  * @desc convert object / string input to color if necessary
	  * @param {Object | String | color} value - color instance, object (hsv, hsl or rgb), string (hsl, rgb, hex)
	  * @return {color} color instance
	*/

	function getColor(value) {
	  return value instanceof color ? value : new color(value);
	}
	/**
	  * @desc clamp value between min and max
	  * @param {Number} value
	  * @param {Number} min
	  * @param {Number} max
	  * @return {Number}
	*/

	function clamp(value, min, max) {
	  return value <= min ? min : value >= max ? max : value;
	}
	/**
	  * @desc compare values between two objects, returns a object representing changes with true/false values
	  * @param {Object} a
	  * @param {Object} b
	  * @return {Object}
	*/

	function compareObjs(a, b) {
	  var changes = {};

	  for (var key in a) { changes[key] = b[key] != a[key]; }

	  return changes;
	}
	var color = function color(value) {
	  // The watch callback function for this color will be stored here
	  this._onChange = false; // The default color value

	  this._value = {
	    h: undefined,
	    s: undefined,
	    v: undefined
	  };
	  if (value) { this.set(value); }
	};

	var prototypeAccessors = { hsv: { configurable: true },rgb: { configurable: true },hsl: { configurable: true },rgbString: { configurable: true },hexString: { configurable: true },hslString: { configurable: true } };
	/**
	  * @desc mix two colors
	  * @param {Object | String | color} color1 - color instance, object (hsv, hsl or rgb), string (hsl, rgb, hex)
	  * @param {Object | String | color} color2 - color instance, object (hsv, hsl or rgb), string (hsl, rgb, hex)
	  * @param {Number} weight - closer to 0 = more color1, closer to 100 = more color2
	  * @return {color} color instance
	*/


	color.mix = function mix (color1, color2, weight) {
	  var rgb1 = getColor(color1).rgb,
	      rgb2 = getColor(color2).rgb;
	  weight = clamp(weight / 100 || 0.5, 0, 1);
	  return new color({
	    r: floor(rgb1.r + (rgb2.r - rgb1.r) * weight),
	    g: floor(rgb1.g + (rgb2.g - rgb1.g) * weight),
	    b: floor(rgb1.b + (rgb2.b - rgb1.b) * weight)
	  });
	};
	/**
	  * @desc lighten color by amount
	  * @param {Object | String | color} color - color instance, object (hsv, hsl or rgb), string (hsl, rgb, hex)
	  * @param {Number} amount
	  * @return {color} color instance
	*/


	color.lighten = function lighten (color, amount) {
	  var col = getColor(color),
	      hsv = col.hsv;
	  hsv.v = clamp(hsv.v + amount, 0, 100);
	  col.hsv = hsv;
	  return col;
	};
	/**
	  * @desc darken color by amount
	  * @param {Object | String | color} color - color instance, object (hsv, hsl or rgb), string (hsl, rgb, hex)
	  * @param {Number} amount
	  * @return {color} color instance
	*/


	color.darken = function darken (color, amount) {
	  var col = getColor(color),
	      hsv = col.hsv;
	  hsv.v = clamp(hsv.v - amount, 0, 100);
	  col.hsv = hsv;
	  return col;
	};
	/**
	  * @desc convert hsv object to rgb
	  * @param {Object} hsv - hsv object
	  * @return {Object} rgb object
	*/


	color.hsv2Rgb = function hsv2Rgb (hsv) {
	  var r, g, b, i, f, p, q, t;
	  var h = hsv.h / 360,
	      s = hsv.s / 100,
	      v = hsv.v / 100;
	  i = floor(h * 6);
	  f = h * 6 - i;
	  p = v * (1 - s);
	  q = v * (1 - f * s);
	  t = v * (1 - (1 - f) * s);

	  switch (i % 6) {
	    case 0:
	      r = v, g = t, b = p;
	      break;

	    case 1:
	      r = q, g = v, b = p;
	      break;

	    case 2:
	      r = p, g = v, b = t;
	      break;

	    case 3:
	      r = p, g = q, b = v;
	      break;

	    case 4:
	      r = t, g = p, b = v;
	      break;

	    case 5:
	      r = v, g = p, b = q;
	      break;
	  }

	  return {
	    r: round(r * 255),
	    g: round(g * 255),
	    b: round(b * 255)
	  };
	};
	/**
	  * @desc convert rgb object to hsv
	  * @param {Object} rgb - rgb object
	  * @return {Object} hsv object
	*/


	color.rgb2Hsv = function rgb2Hsv (rgb) {
	  // Modified from https://github.com/bgrins/TinyColor/blob/master/tinycolor.js#L446
	  var r = rgb.r / 255,
	      g = rgb.g / 255,
	      b = rgb.b / 255,
	      max = Math.max(r, g, b),
	      min = Math.min(r, g, b),
	      delta = max - min,
	      hue;

	  switch (max) {
	    case min:
	      hue = 0;
	      break;

	    case r:
	      hue = (g - b) / delta + (g < b ? 6 : 0);
	      break;

	    case g:
	      hue = (b - r) / delta + 2;
	      break;

	    case b:
	      hue = (r - g) / delta + 4;
	      break;
	  }

	  hue /= 6;
	  return {
	    h: hue * 360,
	    s: max == 0 ? 0 : delta / max * 100,
	    v: max * 100
	  };
	};
	/**
	  * @desc convert hsv object to hsl
	  * @param {Object} hsv - hsv object
	  * @return {Object} hsl object
	*/


	color.hsv2Hsl = function hsv2Hsl (hsv) {
	  var s = hsv.s / 100,
	      v = hsv.v / 100;
	  var l = 0.5 * v * (2 - s);
	  s = v * s / (1 - Math.abs(2 * l - 1));
	  return {
	    h: hsv.h,
	    s: s * 100 || 0,
	    l: l * 100
	  };
	};
	/**
	  * @desc convert hsl object to hsv
	  * @param {Object} hsl - hsl object
	  * @return {Object} hsv object
	*/


	color.hsl2Hsv = function hsl2Hsv (hsl) {
	  var s = hsl.s / 100,
	      l = hsl.l / 100;
	  l *= 2;
	  s *= l <= 1 ? l : 2 - l;
	  return {
	    h: hsl.h,
	    s: 2 * s / (l + s) * 100,
	    v: (l + s) / 2 * 100
	  };
	};
	/**
	  * @desc convert hsl object to string
	  * @param {Object} hsl - hsl object
	  * @return {Object} hsl string
	*/


	color.hsl2Str = function hsl2Str (hsl) {
	  return "hsl" + (hsl.a ? "a" : "") + "(" + hsl.h + ", " + hsl.s + "%, " + hsl.l + "%" + (hsl.a ? ", " + hsl.a : "") + ")";
	};
	/**
	  * @desc convert rgb object to string
	  * @param {Object} rgb - rgb object
	  * @return {Object} rgb string
	*/


	color.rgb2Str = function rgb2Str (rgb) {
	  return "rgb" + (rgb.a ? "a" : "") + "(" + rgb.r + ", " + rgb.g + ", " + rgb.b + (rgb.a ? ", " + rgb.a : "") + ")";
	};
	/**
	  * @desc convert rgb object to hex string
	  * @param {Object} rgb - rgb object
	  * @return {Object} hex string
	*/


	color.rgb2Hex = function rgb2Hex (rgb) {
	  var str = "#";
	  str += rgb.r.toString(16).padStart(2, "0");
	  str += rgb.g.toString(16).padStart(2, "0");
	  str += rgb.b.toString(16).padStart(2, "0");
	  return str;
	};
	/**
	  * @desc parse hex string
	  * @param {String} str - color string
	  * @return {Object} rgb object
	*/


	color.parseHexStr = function parseHexStr (hex) {
	  // Strip any "#" characters
	  hex = hex.replace("#", ""); // Prefix the hex string with "0x" which indicates a number in hex notation, then convert to an integer

	  var int = parseInt("0x" + hex),
	      // If the length of the input is only 3, then it is a shorthand hex color
	  isShorthand = hex.length == 3,
	      // bitMask for isolating each channel
	  bitMask = isShorthand ? 0xF : 0xFF,
	      // bitLength of each channel (for example, F is 4 bits long while FF is 8 bits long)
	  bitLength = isShorthand ? 4 : 8,
	      // If we're using shorthand notation, multiply each channel by 17
	  multiplier = isShorthand ? 17 : 1;
	  return {
	    r: (int >> bitLength * 2 & bitMask) * multiplier,
	    g: (int >> bitLength & bitMask) * multiplier,
	    b: (int & bitMask) * multiplier
	  };
	};
	/**
	  * @desc parse hsl string
	  * @param {String} str - color string
	  * @return {Object} hsl object
	*/


	color.parseHslStr = function parseHslStr (str) {
	  var parsed = parseColorStr(str, [360, 100, 100]);
	  return {
	    h: parsed[2],
	    s: parsed[3],
	    l: parsed[4]
	  };
	};
	/**
	  * @desc parse rgb string
	  * @param {String} str - color string
	  * @return {Object} rgb object
	*/


	color.parseRgbStr = function parseRgbStr (str) {
	  var parsed = parseColorStr(str, [255, 255, 255]);
	  return {
	    r: parsed[1],
	    g: parsed[2],
	    b: parsed[3]
	  };
	};

	prototypeAccessors.hsv.get = function () {
	  // _value is cloned to allow changes to be made to the values before passing them back
	  var v = this._value;
	  return {
	    h: v.h,
	    s: v.s,
	    v: v.v
	  };
	};

	prototypeAccessors.hsv.set = function (newValue) {
	  // If this color is being watched for changes we need to compare the new and old values to check the difference
	  // Otherwise we can just be lazy
	  if (this._onChange) {
	    var oldValue = this._value;

	    for (var channel in oldValue) {
	      if (!newValue.hasOwnProperty(channel)) { newValue[channel] = oldValue[channel]; }
	    }

	    var changes = compareObjs(oldValue, newValue); // Update the old value

	    this._value = newValue; // If the value has changed, call hook callback

	    if (changes.h || changes.s || changes.v) { this._onChange(this, changes); }
	  } else {
	    this._value = newValue;
	  }
	};

	prototypeAccessors.rgb.get = function () {
	  var rgb = color.hsv2Rgb(this._value);
	  return {
	    r: round(rgb.r),
	    g: round(rgb.g),
	    b: round(rgb.b)
	  };
	};

	prototypeAccessors.rgb.set = function (value) {
	  this.hsv = color.rgb2Hsv(value);
	};

	prototypeAccessors.hsl.get = function () {
	  var hsl = color.hsv2Hsl(this._value);
	  return {
	    h: round(hsl.h),
	    s: round(hsl.s),
	    l: round(hsl.l)
	  };
	};

	prototypeAccessors.hsl.set = function (value) {
	  this.hsv = color.hsl2Hsv(value);
	};

	prototypeAccessors.rgbString.get = function () {
	  return color.rgb2Str(this.rgb);
	};

	prototypeAccessors.rgbString.set = function (value) {
	  this.rgb = color.parseRgbStr(value);
	};

	prototypeAccessors.hexString.get = function () {
	  return color.rgb2Hex(this.rgb);
	};

	prototypeAccessors.hexString.set = function (value) {
	  this.rgb = color.parseHexStr(value);
	};

	prototypeAccessors.hslString.get = function () {
	  return color.hsl2Str(this.hsl);
	};

	prototypeAccessors.hslString.set = function (value) {
	  this.hsl = color.parseHslStr(value);
	};
	/**
	  * @desc set the color from any valid value
	  * @param {Object | String | color} value - color instance, object (hsv, hsl or rgb), string (hsl, rgb, hex)
	*/


	color.prototype.set = function set (value) {
	  if (typeof value == "object") {
	    if (value instanceof color) {
	      this.hsv = color.hsv;
	    } else if ("r" in value) {
	      this.rgb = value;
	    } else if ("v" in value) {
	      this.hsv = value;
	    } else if ("l" in value) {
	      this.hsl = value;
	    }
	  } else if (typeof value == "string") {
	    if (/^rgb/.test(value)) {
	      this.rgbString = value;
	    } else if (/^hsl/.test(value)) {
	      this.hslString = value;
	    } else if (/^#[0-9A-Fa-f]/.test(value)) {
	      this.hexString = value;
	    }
	  }
	};
	/**
	  * @desc shortcut to set a specific channel value
	  * @param {String} model - hsv | hsl | rgb
	  * @param {String} channel - individual channel to set, for example if model = hsl, chanel = h | s | l
	  * @param {Number} value - new value for the channel
	*/


	color.prototype.setChannel = function setChannel (model, channel, value) {
	  var v = this[model];
	  v[channel] = value;
	  this[model] = v;
	};
	/**
	  * @desc make new color instance with the same value as this one
	  * @return {color}
	*/


	color.prototype.clone = function clone () {
	  return new color(this);
	};
	/**
	  * @desc compare this color against another, returns a object representing changes with true/false values
	  * @param {Object | String | color} color - color to compare against
	  * @param {String} model - hsv | hsl | rgb
	  * @return {Object}
	*/


	color.prototype.compare = function compare (color, model) {
	  model = model || "hsv";
	  return compareObjs(this[model], getColor(color)[model]);
	};
	/**
	  * @desc mix a color into this one
	  * @param {Object | String | color} color - color instance, object (hsv, hsl or rgb), string (hsl, rgb, hex)
	  * @param {Number} weight - closer to 0 = more current color, closer to 100 = more new color
	*/


	color.prototype.mix = function mix$1 (color, weight) {
	  this.hsv = mix(this, color, weight).hsv;
	};
	/**
	  * @desc lighten color by amount
	  * @param {Number} amount
	*/


	color.prototype.lighten = function lighten$1 (amount) {
	  lighten(this, amount);
	};
	/**
	  * @desc darken color by amount
	  * @param {Number} amount
	*/


	color.prototype.darken = function darken$1 (amount) {
	  darken(this, amount);
	};

	Object.defineProperties( color.prototype, prototypeAccessors );

	var IroSlider = (function (IroComponent$$1) {
	  function IroSlider () {
	    IroComponent$$1.apply(this, arguments);
	  }

	  if ( IroComponent$$1 ) IroSlider.__proto__ = IroComponent$$1;
	  IroSlider.prototype = Object.create( IroComponent$$1 && IroComponent$$1.prototype );
	  IroSlider.prototype.constructor = IroSlider;

	  IroSlider.prototype.render = function render$$1 (props) {
	    var this$1 = this;

	    var width = 300;
	    var height = props.sliderHeight;
	    var hsv = props.hsv;
	    var hsl = color.hsv2Hsl({
	      h: hsv.h,
	      s: hsv.s,
	      v: 100
	    });
	    return h("svg", {
	      class: "iro__slider",
	      x: props.x,
	      y: props.y,
	      ref: function (el) { return this$1.root = el; }
	    }, h("defs", null, h("linearGradient", {
	      id: "iroGradient1"
	    }, h("stop", {
	      offset: "0%",
	      "stop-color": "#000"
	    }), h("stop", {
	      offset: "100%",
	      "stop-color": ("hsl(" + (hsl.h) + ", " + (hsl.s) + "%, " + (hsl.v) + "%)")
	    }))), h("rect", {
	      class: "iro__slider__value",
	      rx: height / 2,
	      ry: height / 2,
	      x: 0,
	      y: 0,
	      width: width,
	      height: height,
	      "stroke-width": props.borderWidth,
	      stroke: props.borderColor,
	      fill: "url(#iroGradient1)",
	      vectorEffect: "non-scaling-stroke"
	    }), h(IroMarker, {
	      r: props.markerRadius,
	      x: hsv.v / 100 * width,
	      y: height / 2
	    }));
	  };
	  /**
	    * @desc Takes a point at (x, y) and returns HSV values based on this input -- use this to update a color from mouse input
	    * @param {Number} x - point x coordinate
	    * @param {Number} y - point y coordinate
	    * @return {Object} - new HSV color values (some channels may be missing)
	  */


	  IroSlider.prototype.input = function input (x, y, rect, type) {
	    x = x - rect.left;
	    y = y - rect.top;
	    var opts = this.props;
	    var range = opts.width;
	    var dist = Math.max(Math.min(x, range.max), range.min) - range.min;
	    return {
	      v: Math.round(100 / range.w * dist)
	    };
	  };

	  return IroSlider;
	}(IroComponent));

	var stylesheet = function stylesheet() {
	  // Create a new style element
	  var style = document.createElement("style");
	  document.head.appendChild(style); // Webkit apparently requires a text node to be inserted into the style element
	  // (according to https://davidwalsh.name/add-rules-stylesheets)

	  style.appendChild(document.createTextNode(""));
	  this.style = style; // Create a reference to the style element's CSSStyleSheet object
	  // CSSStyleSheet API: https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleSheet

	  var sheet = style.sheet;
	  this.sheet = sheet; // Get a reference to the sheet's CSSRuleList object
	  // CSSRuleList API: https://developer.mozilla.org/en-US/docs/Web/API/CSSRuleList

	  this.rules = sheet.rules || sheet.cssRules; // We'll store references to all the CSSStyleDeclaration objects that we change here, keyed by the CSS selector they belong to
	  // CSSStyleDeclaration API: https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleDeclaration

	  this.map = {};
	};

	var prototypeAccessors$1 = { enabled: { configurable: true },cssText: { configurable: true },css: { configurable: true } };

	prototypeAccessors$1.enabled.get = function () {
	  return !this.sheet.disabled;
	};

	prototypeAccessors$1.enabled.set = function (value) {
	  this.sheet.disabled = !value;
	}; // TODO: consider removing cssText + css properties since i don't tink they're that useful


	prototypeAccessors$1.cssText.get = function () {
	  var map = this.map;
	  var ret = [];

	  for (var selector in map) {
	    ret.push(selector.replace(/,\W/g, ",\n") + " {\n\t" + map[selector].cssText.replace(/;\W/g, ";\n\t") + "\n}");
	  }

	  return ret.join("\n");
	};

	prototypeAccessors$1.css.get = function () {
	  var map = this.map;
	  var ret = {};

	  for (var selector in map) {
	    var ruleSet = map[selector];
	    ret[selector] = {};

	    for (var i = 0; i < ruleSet.length; i++) {
	      var property = ruleSet[i];
	      ret[selector][property] = ruleSet.getPropertyValue(property);
	    }
	  }

	  return ret;
	};
	/**
	  * @desc Set a specific rule for a given selector
	  * @param {String} selector - the CSS selector for this rule (e.g. "body", ".class", "#id")
	  * @param {String} property - the CSS property to set (e.g. "background-color", "font-family", "z-index")
	  * @param {String} value  - the new value for the rule (e.g. "rgb(255, 255, 255)", "Helvetica", "99")
	*/


	stylesheet.prototype.setRule = function setRule (selector, property, value) {
	  var sheet = this.sheet;
	  var rules = sheet.rules || sheet.cssRules;
	  var map = this.map; // Convert property from camelCase to snake-case

	  property = property.replace(/([A-Z])/g, function ($1) {
	    return "-" + $1.toLowerCase();
	  });

	  if (!map.hasOwnProperty(selector)) {
	    // If the selector hasn't been used yet we want to insert the rule at the end of the CSSRuleList, so we use its length as the index value
	    var index = rules.length; // Prepare the rule declaration text, since both insertRule and addRule take this format

	    var declaration = property + ": " + value; // Insert the new rule into the stylesheet

	    try {
	      // Some browsers only support insertRule, others only support addRule, so we have to use both
	      sheet.insertRule(selector + " {" + declaration + ";}", index);
	    } catch (e) {
	      sheet.addRule(selector, declaration, index);
	    } finally {
	      // Because safari is perhaps the worst browser in all of history, we have to remind it to keep the sheet rules up-to-date
	      rules = sheet.rules || sheet.cssRules; // Add our newly inserted rule's CSSStyleDeclaration object to the internal map

	      map[selector] = rules[index].style;
	    }
	  } else {
	    map[selector].setProperty(property, value);
	  }
	};

	Object.defineProperties( stylesheet.prototype, prototypeAccessors$1 );

	var ColorPicker = (function (Component$$1) {
	  function ColorPicker(props) {
	    Component$$1.call(this, props);
	    this._events = {};
	    this._colorChangeActive = false;
	    this.css = props.css || props.styles || undefined;
	    this.color = new color(props.color);
	    this.state = {
	      hsv: {
	        h: 0,
	        s: 0,
	        v: 0
	      }
	    };
	  }

	  if ( Component$$1 ) ColorPicker.__proto__ = Component$$1;
	  ColorPicker.prototype = Object.create( Component$$1 && Component$$1.prototype );
	  ColorPicker.prototype.constructor = ColorPicker;

	  ColorPicker.prototype.componentDidMount = function componentDidMount () {
	    // Create an iroStyleSheet for this colorWheel's CSS overrides
	    this.stylesheet = new stylesheet();
	    this.emit("mount", this);
	  };

	  ColorPicker.prototype.componentWillUnmount = function componentWillUnmount () {};
	  /**
	    * @desc update the selected color
	    * @param {Object} hsv - new hsv value
	    * @access protected
	  */


	  ColorPicker.prototype.setHsv = function setHsv (hsv, changes) {
	    var this$1 = this;

	    this.color.hsv = hsv;
	    this.setState({
	      hsv: hsv
	    });
	    var rgb = this.color.rgbString;
	    var css = this.css;

	    for (var selector in css) {
	      var properties = css[selector];

	      for (var prop in properties) {
	        this$1.stylesheet.setRule(selector, prop, rgb);
	      }
	    } // Prevent infinite loops if the color is set inside a `color:change` callback


	    if (!this._colorChangeActive) {
	      // While _colorChangeActive = true, this event cannot be fired
	      this._colorChangeActive = true;
	      this.emit("color:change", this.color);
	      this._colorChangeActive = false;
	    }
	  };
	  /**
	    * @desc Set a callback function for an event
	    * @param {String} eventType Name of the event to listen to, pass "*" to listen to all events
	    * @param {Function} callback Event callback
	  */


	  ColorPicker.prototype.on = function on (eventType, callback) {
	    var events = this._events;
	    (events[eventType] || (events[eventType] = [])).push(callback);
	  };
	  /**
	    * @desc Remove a callback function for an event added with on()
	    * @param {String} eventType The name of the event
	    * @param {Function} callback The watch callback to remove from the event
	  */


	  ColorPicker.prototype.off = function off (eventType, callback) {
	    var eventList = this._events[eventType];
	    if (eventList) { eventList.splice(eventList.indexOf(callback), 1); }
	  };
	  /**
	    * @desc Emit an event
	    * @param {String} eventType The name of the event to emit
	    * @param {Array} args array of args to pass to callbacks
	  */


	  ColorPicker.prototype.emit = function emit (eventType) {
	    var args = [], len = arguments.length - 1;
	    while ( len-- > 0 ) args[ len ] = arguments[ len + 1 ];

	    var events = this._events,
	        callbackList = (events[eventType] || []).concat(events["*"] || []);

	    for (var i = 0; i < callbackList.length; i++) {
	      callbackList[i].apply(null, args);
	    }
	  };

	  ColorPicker.prototype.render = function render$$1 (props, state) {
	    var this$1 = this;

	    return h("svg", {
	      class: "iro__svg",
	      width: props.width,
	      height: props.height,
	      viewBox: ("0 0 " + (props.width) + " " + (props.height)),
	      style: {
	        "display": props.display || "block",
	        "touch-action": "none"
	      },
	      ref: function (el) { return this$1.el = el; }
	    }, h("defs", {
	      rel: "aaa"
	    }), h(IroWheel, _extends({
	      hsv: state.hsv,
	      x: 0,
	      y: 0,
	      radius: 100,
	      rMax: 100,
	      onChange: function () {
	        console.log('aaa');
	      }
	    }, props)));
	  };

	  return ColorPicker;
	}(Component));
	ColorPicker.defaultProps = {
	  width: 300,
	  height: 300,
	  markerRadius: 8,
	  borderColor: "#fff",
	  borderWidth: 0,
	  anticlockwise: false,
	  sliderHeight: 24,
	  sliderMargin: 8
	};

	var iro = {
	  Color: color,
	  ColorPicker: function (el, props) {
	    return render(h(ColorPicker, null), document.querySelector(el))._component;
	  },
	  Stylesheet: stylesheet,
	  ui: {
	    Marker: IroMarker,
	    Slider: IroSlider,
	    Wheel: IroWheel
	  },
	  version: "4.0.0-alpha"
	};

	return iro;

})));
