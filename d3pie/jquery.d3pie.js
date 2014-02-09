/*!
 * d3pie jQuery plugin
 * @author Ben Keen
 * @version 0.1.0
 * @date Feb 2014
 * http://github.com/benkeen/d3pie
 */
;(function($, window, document) {
	"use strict";

	// include the JS files
	var _pluginName = "d3pie";

// to be populated when each item is first rendered on the canvas
var computedSizes = {
	title: { h: 0, w: 0 },
	subtitle: { h: 0, w: 0 },
	topHeaderGroup: { h: 0, w: 0 }
};

var _pieMetadata = {
	totalSize: 0,
	innerRadius: 0,
	outerRadius: 0,
	hasTitle: false,
	hasSubtitle: false,
	hasFooter: false
};

var _arc, _svg,  _options;
var _offscreenCoord = -10000;

// -------------------------------


// our constructor
function d3pie(element, options) {
	this.element = element;
	this.options = $.extend(true, {}, _defaultSettings, options);

	// confirm d3 is available [check minimum version]
	if (!window.d3 || !window.d3.hasOwnProperty("version")) {
		console.error("d3pie error: d3 is not available");
		return;
	}

	// validate here

	this._defaults = _defaultSettings;
	this._name = _pluginName;

	// now initialize the thing
	this.init();
}

// prevents multiple instantiations of the same plugin on the same element
$.fn[_pluginName] = function(options) {
	return this.each(function() {
		if (!$.data(this, _pluginName)) {
			$.data(this, _pluginName, new d3pie(this, options));
		}
	});
};


// ----- public functions -----

d3pie.prototype.destroy = function() {
	$(this.element).removeData(_pluginName); // remove the data attr
	$(this.element).html(""); // clear out the SVG
	//delete this.options;
};

d3pie.prototype.recreate = function() {
	$(this.element).html("");
	this.init();
};


// this let's the user dynamically update aspects of the pie chart without causing a complete redraw. It
// intelligently re-renders only the part of the pie that the user specifies. Some things cause a repaint, others
// just redraw the single element
d3pie.prototype.updateProp = function(propKey, value, optionalSettings) {
	switch (propKey) {
		case "header.title.text":
			var oldValue = d3pie.helpers.processObj(this.options, propKey);
			d3pie.helpers.processObj(this.options, propKey, value);
			$("#title").html(value);
			if ((oldValue === "" && value !== "") || (oldValue !== "" && value === "")) {
				this.recreate();
			}
			break;

		case "header.subtitle.text":
			var oldValue = d3pie.helpers.processObj(this.options, propKey);
			d3pie.helpers.processObj(this.options, propKey, value);
			$("#subtitle").html(value);
			if ((oldValue === "" && value !== "") || (oldValue !== "" && value === "")) {
				this.recreate();
			}
			break;

		case "callbacks.onload":
		case "callbacks.onMouseoverSegment":
		case "callbacks.onMouseoutSegment":
		case "callbacks.onClickSegment":
			d3pie.helpers.processObj(this.options, propKey, value);
			break;
	}
};


// ----- private functions -----


d3pie.prototype.init = function() {
	_options = this.options;

	// 1. Prep-work
	_options.data = d3pie.math.sortPieData(_options.data, _options.misc.dataSortOrder);
	_addSVGSpace(this.element);

	_pieMetadata.hasTitle    = _options.header.title.text !== "";
	_pieMetadata.hasSubtitle = _options.header.subtitle.text !== "";
	_pieMetadata.hasFooter   = _options.footer.text !== "";

	// 2. add all text components offscreen. We need to know their widths/heights for later computation
	_addTextElementsOffscreen();
	_addFooter(); // the footer never moves- just put it in place now.

	// 3. now we have all the data we need, compute the available space for the pie chart
	d3pie.math.computePieRadius();

	// position the title + subtitle. These two are interdependent
	_positionTitle();
	_positionSubtitle();

	// STEP 2: now create the pie chart and add the labels. We have to place this in a timeout because the previous
	// functions took a little time
	setTimeout(function() {
		_createPie();
		_addFilter();
		_addLabels();
		_addSegmentEventHandlers();
	}, 5);
};


var _addTextElementsOffscreen = function() {
	if (_pieMetadata.hasTitle) {
		_addTitle();
	}
	if (_pieMetadata.hasSubtitle) {
		_addSubtitle();
	}
};


// creates the SVG element
var _addSVGSpace = function(element) {
	_svg = d3.select(element).append("svg:svg")
		.attr("width", _options.size.canvasWidth)
		.attr("height", _options.size.canvasHeight);

	if (_options.styles.backgroundColor !== "transparent") {
		_svg.style("background-color", function() { return _options.styles.backgroundColor; });
	}
};

/**
 * Adds the Pie Chart title.
 * @param titleData
 * @private
 */
var _addTitle = function() {
	var title = _svg.selectAll(".title").data([_options.header.title]);
	title.enter()
		.append("text")
		.attr("id", "title")
		.attr("x", _offscreenCoord)
		.attr("y", _offscreenCoord)
		.attr("class", "title")
		.attr("text-anchor", function() {
			var location;
			if (_options.header.location === "top-center" || _options.header.location === "pie-center") {
				location = "middle";
			} else {
				location = "left";
			}
			return location;
		})
		.attr("fill", function(d) { return d.color; })
		.text(function(d) { return d.text; })
		.style("font-size", function(d) { return d.fontSize; })
		.style("font-family", function(d) { return d.font; });
};


var _positionTitle = function() {
	_componentDimensions.title.h = _getTitleHeight();
	var x = (_options.header.location === "top-left") ? _options.misc.canvasPadding.left : _options.size.canvasWidth / 2;
	var y;

	if (_options.header.location === "pie-center") {

		// this is the exact vertical center
		y = ((_options.size.canvasHeight - _options.misc.canvasPadding.bottom) / 2) + _options.misc.canvasPadding.top + (_componentDimensions.title.h / 2);

		// special clause. We want to adjust the title to be slightly higher in the event of their being a subtitle
		if (_hasSubtitle) {
//				_componentDimensions.subtitle.h = _getTitleHeight();
//				var titleSubtitlePlusPaddingHeight = _componentDimensions.subtitle.h + _options.misc.titleSubtitlePadding + _componentDimensions.title.h;
			//y -= (subtitleHeight / 2);
		}

	} else {
		y = (_options.header.location === "pie-center") ? _options.size.canvasHeight / 2 : _options.misc.canvasPadding.top + _componentDimensions.title.h;
	}

	_svg.select("#title")
		.attr("x", x)
		.attr("y", y);
};

var _positionSubtitle = function() {
	var subtitleElement = document.getElementById("subtitle");
	var dimensions = subtitleElement.getBBox();
	var x = (_options.header.location === "top-left") ? _options.misc.canvasPadding.left : _options.size.canvasWidth / 2;

	// when positioning the subtitle, take into account whether there's a title or not
	var y;
	if (_options.header.title.text !== "") {
		var titleY = parseInt(d3.select(document.getElementById("title")).attr("y"), 10);
		y = (_options.header.location === "pie-center") ? _options.size.canvasHeight / 2 : dimensions.height + _options.misc.titleSubtitlePadding + titleY;
	} else {
		y = (_options.header.location === "pie-center") ? _options.size.canvasHeight / 2 : dimensions.height + _options.misc.canvasPadding.top;
	}

	_svg.select("#subtitle")
		.attr("x", x)
		.attr("y", y);
};

var _addSubtitle = function() {
	if (_options.header.subtitle.text === "") {
		return;
	}

	_svg.selectAll(".subtitle")
		.data([_options.header.subtitle])
		.enter()
		.append("text")
		.attr("x", _offscreenCoord)
		.attr("y", _offscreenCoord)
		.attr("id", "subtitle")
		.attr("class", "subtitle")
		.attr("text-anchor", function() {
			var location;
			if (_options.header.location === "top-center" || _options.header.location === "pie-center") {
				location = "middle";
			} else {
				location = "left";
			}
			return location;
		})
		.attr("fill", function(d) { return d.color; })
		.text(function(d) { return d.text; })
		.style("font-size", function(d) { return d.fontSize; })
		.style("font-family", function(d) { return d.font; });
};

var _addFooter = function() {
	_svg.selectAll(".footer")
		.data([_options.footer])
		.enter()
		.append("text")
		.attr("x", _offscreenCoord)
		.attr("y", _offscreenCoord)
		.attr("id", "footer")
		.attr("class", "footer")
		.attr("text-anchor", function() {
			var location;
			if (_options.footer.location === "bottom-center") {
				location = "middle";
			} else if (_options.footer.location === "bottom-right") {
				location = "left"; // on purpose. We have to change the x-coord to make it properly right-aligned
			} else {
				location = "left";
			}
			return location;
		})
		.attr("fill", function(d) { return d.color; })
		.text(function(d) { return d.text; })
		.style("font-size", function(d) { return d.fontSize; })
		.style("font-family", function(d) { return d.font; });

	_whenIdExists("footer", _positionFooter);
};

var _positionFooter = function() {
	var x;
	if (_options.footer.location === "bottom-left") {
		x = _options.misc.canvasPadding.left;
	} else if (_options.footer.location === "bottom-right") {
		var dims = document.getElementById("footer").getBBox();
		x = _options.size.canvasWidth - dims.width - _options.misc.canvasPadding.right;
	} else {
		x = _options.size.canvasWidth / 2;
	}

	_svg.select("#footer")
		.attr("x", x)
		.attr("y", _options.size.canvasHeight - _options.misc.canvasPadding.bottom);
};


var _openSegment = function(segment) {

	// close any open segments
	if ($(".expanded").length > 0) {
		_closeSegment($(".expanded")[0]);
	}

	d3.select(segment).transition()
		.ease(_options.effects.pullOutSegmentOnClick.effect)
		.duration(_options.effects.pullOutSegmentOnClick.speed)
		.attr("transform", function(d, i) {
			var c = _arc.centroid(d),
				x = c[0],
				y = c[1],
				h = Math.sqrt(x*x + y*y),
				pullOutSize = 8;

			return "translate(" + ((x/h) * pullOutSize) + ',' + ((y/h) * pullOutSize) + ")";
		})
		.each("end", function(d, i) {
			$(this).attr("class", "expanded");
		});
};

var _closeSegment = function(segment) {
	d3.select(segment).transition()
		.duration(400)
		.attr("transform", "translate(0,0)")
		.each("end", function(d, i) {
			$(this).attr("class", "");
		});
};


/**
 * Creates the pie chart segments and displays them according to the selected load effect.
 * @param element
 * @param options
 * @private
 */
var _createPie = function() {
	_totalSize = d3pie.math.getTotalPieSize(_options.data);

	var pieChartElement = _svg.append("g")
		.attr("transform", _getPieTranslateCenter)
		.attr("class", "pieChart");

	_arc = d3.svg.arc()
		.innerRadius(_innerRadius)
		.outerRadius(_outerRadius)
		.startAngle(0)
		.endAngle(function(d) {
			var angle = (d.value / _totalSize) * 2 * Math.PI;
			return angle;
		});

	var g = pieChartElement.selectAll(".arc")
		.data(
		_options.data.filter(function(d) { return d.value; }),
		function(d) { return d.label; }
	)
		.enter()
		.append("g")
		.attr("class", function() {
			var className = "arc";
			if (_options.effects.highlightSegmentOnMouseover) {
				className += " arcHover";
			}
			return className;
		});

	// if we're not fading in the pie, just set the load speed to 0
	var loadSpeed = _options.effects.load.speed;
	if (_options.effects.load.effect === "none") {
		loadSpeed = 0;
	}

	g.append("path")
		.attr("id", function(d, i) { return "segment" + i; })
		.style("fill", function(d, index) { return _options.styles.colors[index]; })
		.style("stroke", "#ffffff")
		.style("stroke-width", 1)
		.transition()
		.ease("cubic-in-out")
		.duration(loadSpeed)
		.attr("data-index", function(d, i) { return i; })
		.attrTween("d", _arcTween);

	_svg.selectAll("g.arc")
		.attr("transform",
		function(d, i) {
			var angle = _getSegmentRotationAngle(i, _options.data, _totalSize);
			return "rotate(" + angle + ")";
		}
	);
};


var _addSegmentEventHandlers = function() {
	$(".arc").on("click", function(e) {
		var $segment = $(e.currentTarget).find("path");
		var isExpanded = $segment.attr("class") === "expanded";

		_onSegmentEvent(_options.callbacks.onClickSegment, $segment, isExpanded);

		if (_options.effects.pullOutSegmentOnClick.effect !== "none") {
			if (isExpanded) {
				_closeSegment($segment[0]);
			} else {
				_openSegment($segment[0]);
			}
		}
	});

	$(".arc").on("mouseover", function(e) {
		var $segment = $(e.currentTarget).find("path");
		var isExpanded = $segment.attr("class") === "expanded";
		_onSegmentEvent(_options.callbacks.onMouseoverSegment, $segment, isExpanded);
	});

	$(".arc").on("mouseout", function(e) {
		var $segment = $(e.currentTarget).find("path");
		var isExpanded = $segment.attr("class") === "expanded";
		_onSegmentEvent(_options.callbacks.onMouseoutSegment, $segment, isExpanded);
	});
};

// helper function used to call the click, mouseover, mouseout segment callback functions
var _onSegmentEvent = function(func, $segment, isExpanded) {
	if (!$.isFunction(func)) {
		return;
	}
	try {
		var index = parseInt($segment.data("index"), 10);
		func({
			segment: $segment[0],
			index: index,
			expanded: isExpanded,
			data: _options.data[index]
		});
	} catch(e) { }
};


var _addFilter = function() {
	//console.log(_getPieCenter());
	//_svg.append('<filter id="testBlur"><feDiffuseLighting in="SourceGraphic" result="light" lighting-color="white"><fePointLight x="150" y="60" z="20" /></feDiffuseLighting><feComposite in="SourceGraphic" in2="light" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/></filter>')
};


	var _defaultSettings = {
	header: {
		title: {
			color:    "#333333",
			fontSize: "14px",
			font:     "helvetica"
		},
		subtitle: {
			color:    "#333333",
			fontSize: "14px",
			font:     "helvetica"
		},
		location: "top-left"
	},
	footer: {
		text: ""
	},
	size: {
		canvasHeight: 500,
		canvasWidth: 500,
		pieInnerRadius: "100%",
		pieOuterRadius: null
	},
	labels: {
		inside: "percentage",
		outisde: "label",
		hideLabelsForSmallSegments: false,
		hideLabelsForSmallSegmentSize: "0%"
	},
	styles: {
		backgroundColor: null,
		colors: ["#98abc5", "#8a89a6", "#7b6888", "#6b486b", "#a05d56", "#d0743c", "#ff8c00", "#635222", "#00dd00"]
	},
	effects: {
		load: {
			effect: "default", // none / default
			speed: 1000
		},
		pullOutSegmentOnClick: {
			effect: "linear", // none / linear / bounce /
			speed: 400
		},

		highlightSegmentOnMouseover: false,
		labelFadeInTime: 400
	},
	tooltips: {
		enable: false
	},
	callbacks: {
		onload: null,
		onMouseoverSegment: null,
		onMouseoutSegment: null,
		onClickSegment: null
	},
	misc: {
//			enableTooltips: false,
//			dataSortOrder: "none",
//			hideLabelsForSmallSegments: false,
//			hideLabelsForSmallSegmentSize: "5%",
//			preventTextSelection: true

		cssPrefix: "auto", //
		dataSortOrder: "none", // none, value-asc, value-desc, label-asc, label-desc, random
		canvasPadding: {
			top: 5,
			right: 5,
			bottom: 5,
			left: 5
		},
		titleSubtitlePadding: 5, // the padding between the title and subtitle
		footerPiePadding: 0,
		labelPieDistance: 16,
		textSelectable: false
	}
};

	
	d3pie.helpers = function() {

	var _toRadians = function(degrees) {
		return degrees * (Math.PI / 180);
	};

	var _toDegrees = function(radians) {
		return radians * (180 / Math.PI);
	};

	var _whenIdExists = function(id, callback) {
		var inc = 1;
		var giveupTime = 1000;
		var interval = setInterval(function () {
			if (document.getElementById(id)) {
				clearInterval(interval);
				callback();
			}
			if (inc > giveupTime) {
				clearInterval(interval);
			}
			inc++;
		}, 1);
	};

	var _shuffleArray = function(array) {
		var currentIndex = array.length, tmpVal, randomIndex;

		while (0 !== currentIndex) {
			randomIndex = Math.floor(Math.random() * currentIndex);
			currentIndex -= 1;

			// and swap it with the current element
			tmpVal = array[currentIndex];
			array[currentIndex] = array[randomIndex];
			array[randomIndex] = tmpVal;
		}
		return array;
	};

	var _processObj = function(obj, is, value) {
		if (typeof is == 'string') {
			return _processObj(obj, is.split('.'), value);
		} else if (is.length == 1 && value !== undefined) {
			return obj[is[0]] = value;
		} else if (is.length == 0) {
			return obj;
		} else {
			return _processObj(obj[is[0]], is.slice(1), value);
		}
	};

	var _getHeight = function(id) {
		var dimensions = document.getElementById(id).getBBox();
		return dimensions.height;
	};

	var _getWidth = function(id) {
		var dimensions = document.getElementById(id).getBBox();
		return dimensions.width;
	};

	return {
		toRadians: _toRadians,
		toDegrees: _toDegrees,
		shuffleArray: _shuffleArray,
		whenIdExists: _whenIdExists,
		processObj: _processObj,
		getHeight: _getHeight,
		getWidth: _getWidth
	};
};

	/**
 * Contains all the math needed to figure out where to place things, etc.
 */
d3pie.math = function() {

	var _computePieRadius = function() {
		// outer radius is either specified (e.g. through the generator), or omitted altogether
		// and calculated based on the canvas dimensions. Right now the estimated version isn't great - it should
		// be possible to calculate it to precisely generate the maximum sized pie, but it's fussy as heck

		// first, calculate the default _outerRadius
		var w = _options.size.canvasWidth - _options.misc.canvasPadding.left - _options.misc.canvasPadding.right;
		var h = _options.size.canvasHeight; // - headerHeight - _options.misc.canvasPadding.bottom - footerHeight);

		_outerRadius = ((w < h) ? w : h) / 2.8;

		// if the user specified something, use that instead
		if (_options.size.pieOuterRadius !== null) {
			if (/%/.test(_options.size.pieOuterRadius)) {
				var percent = parseInt(_options.size.pieOuterRadius.replace(/[\D]/, ""), 10);
				percent = (percent > 99) ? 99 : percent;
				percent = (percent < 0) ? 0 : percent;
				var smallestDimension = (w < h) ? w : h;
				_outerRadius = Math.floor((smallestDimension / 100) * percent) / 2;
			} else {
				// blurgh! TODO bounds checking
				_outerRadius = parseInt(_options.size.pieOuterRadius, 10);
			}
		}

		// inner radius
		if (/%/.test(_options.size.pieInnerRadius)) {
			var percent = parseInt(_options.size.pieInnerRadius.replace(/[\D]/, ""), 10);
			percent = (percent > 99) ? 99 : percent;
			percent = (percent < 0) ? 0 : percent;
			_innerRadius = Math.floor((_outerRadius / 100) * percent);
		} else {
			_innerRadius = parseInt(_options.size.pieInnerRadius, 10);
		}
	};

	var _getTotalPieSize = function(data) {
		var totalSize = 0;
		for (var i=0; i<data.length; i++) {
			totalSize += data[i].value;
		}
		return totalSize;
	};

	var _sortPieData = function(data, sortOrder) {
		switch (sortOrder) {
			case "none":
				// do nothing.
				break;
			case "random":
				data = d3pie.helpers.shuffleArray(data);
				break;
			case "value-asc":
				data.sort(function(a, b) { return (a.value < b.value) ? 1 : -1 });
				break;
			case "value-desc":
				data.sort(function(a, b) { return (a.value > b.value) ? 1 : -1 });
				break;
			case "label-asc":
				data.sort(function(a, b) { return (a.label.toLowerCase() > b.label.toLowerCase()) ? 1 : -1 });
				break;
			case "label-desc":
				data.sort(function(a, b) { return (a.label.toLowerCase() < b.label.toLowerCase()) ? 1 : -1 });
				break;
		}
		return data;
	}

	var _getPieTranslateCenter = function() {
		var pieCenter = _getPieCenter();
		return "translate(" + pieCenter.x + "," + pieCenter.y + ")"
	};

	/**
	 * Used to determine where on the canvas the center of the pie chart should be. It takes into account the
	 * height and position of the title, subtitle and footer, and the various paddings.
	 * @private
	 */
	var _getPieCenter = function() {
		var hasTopTitle    = (_hasTitle && _options.header.location !== "pie-center");
		var hasTopSubtitle = (_hasSubtitle && _options.header.location !== "pie-center");

		var headerOffset = _options.misc.canvasPadding.top;
		if (hasTopTitle && hasTopSubtitle) {
			headerOffset = parseInt(d3.select(document.getElementById("subtitle")).attr("y"), 10) + _options.misc.titleSubtitlePadding;
		} else if (hasTopTitle) {
			headerOffset = parseInt(d3.select(document.getElementById("title")).attr("y"), 10);
		} else if (hasTopSubtitle) {
			headerOffset = parseInt(d3.select(document.getElementById("subtitle")).attr("y"), 10);
		}

		var footerOffset = 0;
		if (_hasFooter) {
			footerOffset = _getFooterHeight() + _options.misc.canvasPadding.bottom;
		}

		return {
			x: ((_options.size.canvasWidth - _options.misc.canvasPadding.right) / 2) + _options.misc.canvasPadding.left,
			y: ((_options.size.canvasHeight - footerOffset) / 2) + headerOffset
		}
	};

	var _arcTween = function(b) {
		var i = d3.interpolate({ value: 0 }, b);
		return function(t) {
			return _arc(i(t));
		};
	};

	var _getSegmentRotationAngle = function(index, data, totalSize) {
		var val = 0;
		for (var i=0; i<index; i++) {
			try {
				val += data[i].value;
			} catch (e) {
				console.error("error in _getSegmentRotationAngle:", data, i);
			}
		}
		return (val / totalSize) * 360;
	};

	return {
		computePieRadius: _computePieRadius,
		getTotalPieSize: _getTotalPieSize,
		sortPieData: _sortPieData,
		getPieTranslateCenter: _getPieTranslateCenter,
		getPieCenter: _getPieCenter,
		arcTween: _arcTween,
		getSegmentRotationAngle: _getSegmentRotationAngle
	};
};
	d3pie.labels = function() {

	/**
	 * Add the labels to the pie.
	 * @param options
	 * @private
	 */
	var _addLabels = function() {

		// 1. Add the main label (not positioned yet)
		var labelGroup = _svg.selectAll(".labelGroup")
			.data(
			_options.data.filter(function(d) { return d.value; }),
			function(d) { return d.label; }
		)
			.enter()
			.append("g")
			.attr("class", "labelGroup")
			.attr("id", function(d, i) {
				return "labelGroup" + i;
			})
			.attr("transform", _getPieTranslateCenter);

		labelGroup.append("text")
			.attr("class", "segmentLabel")
			.attr("id", function(d, i) { return "label" + i; })
			.text(function(d) { return d.label; })
			.style("font-size", "8pt")
			.style("fill", _options.labels.labelColor)
			.style("opacity", 0);

		// 2. Add the percentage label (not positioned yet)


		// 3. Add the value label (not positioned yet)

		/*
		 labelGroup.append("text")
		 .text(function(d) {
		 return Math.round((d.value / _totalSize) * 100) + "%";
		 })
		 .attr("class", "pieShare")
		 .attr("transform", function(d, i) {
		 var angle = _getSegmentRotationAngle(d, i, _data, _totalSize);
		 var labelRadius = _outerRadius + 30;
		 var c = _arc.centroid(d),
		 x = c[0],
		 y = c[1],
		 h = Math.sqrt(x*x + y*y); // pythagorean theorem for hypotenuse

		 return "translate(" + (x/h * labelRadius) +  ',' + (y/h * labelRadius) +  ") rotate(" + -angle + ")";
		 })
		 .style("fill", options.labels.labelPercentageColor)
		 .style("font-size", "8pt")
		 .style("opacity", function() {
		 return (options.effects.loadEffect === "fadein") ? 0 : 1;
		 });
		 */

		// fade in the labels when the load effect is complete - or immediately if there's no load effect
		var loadSpeed = (_options.effects.load.effect === "default") ? _options.effects.load.speed : 1;
		setTimeout(function() {
			var labelFadeInTime = (_options.effects.load.effect === "default") ? _options.effects.labelFadeInTime : 1;
			d3.selectAll("text.segmentLabel")
				.transition()
				.duration(labelFadeInTime)
				.style("opacity", 1);

			// once everything's done loading, trigger the onload callback if defined
			if ($.isFunction(_options.callbacks.onload)) {
				setTimeout(function() {
					try {
						_options.callbacks.onload();
					} catch (e) { }
				}, labelFadeInTime);
			}

		}, loadSpeed);


		// now place the labels in reasonable locations. This needs to run in a timeout because we need the actual
		// text elements in place prior to
		setTimeout(_addLabelLines, 1);
	};


	// this both adds the lines and positions the labels
	var _addLabelLines = function() {
		var lineMidPointDistance = _options.misc.labelPieDistance - (_options.misc.labelPieDistance / 4);
		var circleCoordGroups = [];

		d3.selectAll(".segmentLabel")
			.style("opacity", 0)
			.attr("dx", function(d, i) {
				var labelDimensions = document.getElementById("label" + i).getBBox();

				var angle = _getSegmentRotationAngle(i, _options.data, _totalSize);
				var nextAngle = 360;
				if (i < _options.data.length - 1) {
					nextAngle = _getSegmentRotationAngle(i+1, _options.data, _totalSize);
				}

				var segmentCenterAngle = angle + ((nextAngle - angle) / 2);
				var remainderAngle = segmentCenterAngle % 90;
				var quarter = Math.floor(segmentCenterAngle / 90);

				var labelXMargin = 10; // the x-distance of the label from the end of the line [TODO configurable?]

				var p1, p2, p3, labelX;
				switch (quarter) {
					case 0:
						var calc1 = Math.sin(_toRadians(remainderAngle));
						labelX = calc1 * (_outerRadius + _options.misc.labelPieDistance) + labelXMargin;
						p1     = calc1 * _outerRadius;
						p2     = calc1 * (_outerRadius + lineMidPointDistance);
						p3     = calc1 * (_outerRadius + _options.misc.labelPieDistance) + 5;
						break;
					case 1:
						var calc2 = Math.cos(_toRadians(remainderAngle));
						labelX = calc2 * (_outerRadius + _options.misc.labelPieDistance) + labelXMargin;
						p1     = calc2 * _outerRadius;
						p2     = calc2 * (_outerRadius + lineMidPointDistance);
						p3     = calc2 * (_outerRadius + _options.misc.labelPieDistance) + 5;
						break;
					case 2:
						var calc3 = Math.sin(_toRadians(remainderAngle));
						labelX = -calc3 * (_outerRadius + _options.misc.labelPieDistance) - labelDimensions.width - labelXMargin;
						p1     = -calc3 * _outerRadius;
						p2     = -calc3 * (_outerRadius + lineMidPointDistance);
						p3     = -calc3 * (_outerRadius + _options.misc.labelPieDistance) - 5;
						break;
					case 3:
						var calc4 = Math.cos(_toRadians(remainderAngle));
						labelX = -calc4 * (_outerRadius + _options.misc.labelPieDistance) - labelDimensions.width - labelXMargin;
						p1     = -calc4 * _outerRadius;
						p2     = -calc4 * (_outerRadius + lineMidPointDistance);
						p3     = -calc4 * (_outerRadius + _options.misc.labelPieDistance) - 5;
						break;
				}
				circleCoordGroups[i] = [
					{ x: p1, y: null },
					{ x: p2, y: null },
					{ x: p3, y: null }
				];

				return labelX;
			})
			.attr("dy", function(d, i) {
				var labelDimensions = document.getElementById("label" + i).getBBox();
				var heightOffset = labelDimensions.height / 5;

				var angle = _getSegmentRotationAngle(i, _options.data, _totalSize);
				var nextAngle = 360;
				if (i < _options.data.length - 1) {
					nextAngle = _getSegmentRotationAngle(i+1, _options.data, _totalSize);
				}
				var segmentCenterAngle = angle + ((nextAngle - angle) / 2);
				var remainderAngle = (segmentCenterAngle % 90);
				var quarter = Math.floor(segmentCenterAngle / 90);
				var p1, p2, p3, labelY;

				switch (quarter) {
					case 0:
						var calc1 = Math.cos(_toRadians(remainderAngle));
						labelY = -calc1 * (_outerRadius + _options.misc.labelPieDistance);
						p1     = -calc1 * _outerRadius;
						p2     = -calc1 * (_outerRadius + lineMidPointDistance);
						p3     = -calc1 * (_outerRadius + _options.misc.labelPieDistance) - heightOffset;
						break;
					case 1:
						var calc2 = Math.sin(_toRadians(remainderAngle));
						labelY = calc2 * (_outerRadius + _options.misc.labelPieDistance);
						p1     = calc2 * _outerRadius;
						p2     = calc2 * (_outerRadius + lineMidPointDistance);
						p3     = calc2 * (_outerRadius + _options.misc.labelPieDistance) - heightOffset;
						break;
					case 2:
						var calc3 = Math.cos(_toRadians(remainderAngle));
						labelY = calc3 * (_outerRadius + _options.misc.labelPieDistance);
						p1     = calc3 * _outerRadius;
						p2     = calc3 * (_outerRadius + lineMidPointDistance);
						p3     = calc3 * (_outerRadius + _options.misc.labelPieDistance) - heightOffset;
						break;
					case 3:
						var calc4 = Math.sin(_toRadians(remainderAngle));
						labelY = -calc4 * (_outerRadius + _options.misc.labelPieDistance);
						p1     = -calc4 * _outerRadius;
						p2     = -calc4 * (_outerRadius + lineMidPointDistance);
						p3     = -calc4 * (_outerRadius + _options.misc.labelPieDistance) - heightOffset;
						break;
				}
				circleCoordGroups[i][0].y = p1;
				circleCoordGroups[i][1].y = p2;
				circleCoordGroups[i][2].y = p3;

				return labelY;
			});

		var lineGroups = _svg.insert("g", ".pieChart")
			.attr("class", "lineGroups")
			.style("opacity", 0);

		var lineGroup = lineGroups.selectAll(".lineGroup")
			.data(circleCoordGroups)
			.enter()
			.append("g")
			.attr("class", "lineGroup")
			.attr("transform", _getPieTranslateCenter);

		var lineFunction = d3.svg.line()
			.interpolate("basis")
			.x(function(d) { return d.x; })
			.y(function(d) { return d.y; });

		lineGroup.append("path")
			.attr("d", lineFunction)
			.attr("stroke", "#666666")
			.attr("stroke-width", 1)
			.attr("fill", "none");

		// fade in the labels when the load effect is complete - or immediately if there's no load effect
		var loadSpeed = (_options.effects.load.effect === "default") ? _options.effects.load.speed : 1;
		setTimeout(function() {
			var labelFadeInTime = (_options.effects.load.effect === "default") ? _options.effects.labelFadeInTime : 1;
			d3.selectAll("g.lineGroups")
				.transition()
				.duration(labelFadeInTime)
				.style("opacity", 1);
		}, loadSpeed);
	};

	return {
		addLabels: _addLabels
	};
};
	

})(jQuery, window, document);