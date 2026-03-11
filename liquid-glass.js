/**
 * Liquid Glass Physics Pipeline
 * Chrome/Edge keep the native backdrop-filter path.
 * Firefox/Safari use a WebGL canvas fallback fed by a cloned source scene.
 */

const MathUtils = {
    convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),
    convex_circle: (x) => Math.sqrt(1 - Math.pow(1 - x, 2)),
    concave: (x) => 1 - Math.sqrt(1 - Math.pow(x, 2)),
    lip: (x) => {
        const convex = Math.pow(1 - Math.pow(1 - Math.min(x * 2, 1), 4), 1 / 4);
        const concave = 1 - Math.sqrt(1 - Math.pow(1 - x, 2)) + 0.1;
        const smootherstep = 6 * Math.pow(x, 5) - 15 * Math.pow(x, 4) + 10 * Math.pow(x, 3);
        return convex * (1 - smootherstep) + concave * smootherstep;
    }
};

class LiquidGlassFilter {
    static instances = new Set();
    static imageCache = new Map();
    static syncRaf = null;
    static globalListenersAttached = false;

    static prefersNativeBackdrop() {
        const ua = navigator.userAgent;
        const isFirefox = ua.includes("Firefox/");
        const isSafari = ua.includes("Safari/") && !ua.includes("Chrome/") && !ua.includes("CriOS/") && !ua.includes("Edg/");
        const isChromium = (ua.includes("Chrome/") || ua.includes("CriOS/") || ua.includes("Edg/")) && !ua.includes("OPR/");

        return isChromium && !isFirefox && !isSafari && CSS.supports("backdrop-filter", "blur(1px)");
    }

    static attachGlobalListeners() {
        if (this.globalListenersAttached) {
            return;
        }

        const scheduleSync = () => LiquidGlassFilter.scheduleAllSync();
        window.addEventListener("resize", scheduleSync, { passive: true });
        window.addEventListener("scroll", scheduleSync, { passive: true });
        this.globalListenersAttached = true;
    }

    static scheduleAllSync() {
        if (this.syncRaf) {
            return;
        }

        this.syncRaf = window.requestAnimationFrame(() => {
            this.syncRaf = null;
            LiquidGlassFilter.instances.forEach((instance) => instance.handleViewportChange());
        });
    }

    static extractFirstUrl(backgroundImage) {
        const match = /url\((['"]?)(.*?)\1\)/.exec(backgroundImage || "");
        return match ? match[2] : "";
    }

    static getCachedImage(src, onLoad) {
        if (!src) {
            return null;
        }

        let entry = LiquidGlassFilter.imageCache.get(src);
        if (!entry) {
            const image = new Image();
            entry = {
                image,
                loaded: false,
                error: false,
                callbacks: []
            };

            image.onload = () => {
                entry.loaded = true;
                entry.callbacks.splice(0).forEach((callback) => callback(image));
            };

            image.onerror = () => {
                entry.error = true;
                entry.callbacks.length = 0;
            };

            image.src = src;
            LiquidGlassFilter.imageCache.set(src, entry);
        }

        if (entry.loaded) {
            return entry.image;
        }

        if (!entry.error && onLoad) {
            entry.callbacks.push(onLoad);
        }

        return null;
    }

    static parseSizeToken(token, containerSize) {
        if (!token || token === "auto") {
            return null;
        }

        if (token.endsWith("%")) {
            return (parseFloat(token) / 100) * containerSize;
        }

        if (token.endsWith("px")) {
            return parseFloat(token);
        }

        const numericValue = parseFloat(token);
        return Number.isFinite(numericValue) ? numericValue : null;
    }

    static parsePositionToken(token, freeSpace, axis) {
        const normalized = (token || "50%").trim().toLowerCase();

        if (normalized === "center") {
            return freeSpace / 2;
        }

        if (axis === "x") {
            if (normalized === "left") {
                return 0;
            }

            if (normalized === "right") {
                return freeSpace;
            }
        }

        if (axis === "y") {
            if (normalized === "top") {
                return 0;
            }

            if (normalized === "bottom") {
                return freeSpace;
            }
        }

        if (normalized.endsWith("%")) {
            return (parseFloat(normalized) / 100) * freeSpace;
        }

        if (normalized.endsWith("px")) {
            return parseFloat(normalized);
        }

        const numericValue = parseFloat(normalized);
        return Number.isFinite(numericValue) ? numericValue : freeSpace / 2;
    }

    static computeBackgroundDrawRect(styles, containerWidth, containerHeight, imageWidth, imageHeight) {
        const backgroundSize = (styles.backgroundSize || "auto").trim();
        let drawWidth = imageWidth;
        let drawHeight = imageHeight;

        if (backgroundSize === "cover") {
            const scale = Math.max(containerWidth / imageWidth, containerHeight / imageHeight);
            drawWidth = imageWidth * scale;
            drawHeight = imageHeight * scale;
        } else if (backgroundSize === "contain") {
            const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
            drawWidth = imageWidth * scale;
            drawHeight = imageHeight * scale;
        } else if (backgroundSize !== "auto") {
            const [rawWidth, rawHeight = "auto"] = backgroundSize.split(/\s+/);
            const parsedWidth = LiquidGlassFilter.parseSizeToken(rawWidth, containerWidth);
            const parsedHeight = LiquidGlassFilter.parseSizeToken(rawHeight, containerHeight);

            if (parsedWidth !== null && parsedHeight !== null) {
                drawWidth = parsedWidth;
                drawHeight = parsedHeight;
            } else if (parsedWidth !== null) {
                drawWidth = parsedWidth;
                drawHeight = imageHeight * (parsedWidth / imageWidth);
            } else if (parsedHeight !== null) {
                drawHeight = parsedHeight;
                drawWidth = imageWidth * (parsedHeight / imageHeight);
            }
        }

        const backgroundPosition = (styles.backgroundPosition || "50% 50%").trim();
        const [posXToken, posYToken = posXToken] = backgroundPosition.split(/\s+/);
        const x = LiquidGlassFilter.parsePositionToken(posXToken, containerWidth - drawWidth, "x");
        const y = LiquidGlassFilter.parsePositionToken(posYToken, containerHeight - drawHeight, "y");

        return { x, y, width: drawWidth, height: drawHeight };
    }

    static computeObjectFitDrawRect(styles, boxWidth, boxHeight, imageWidth, imageHeight) {
        const fit = (styles.objectFit || "fill").trim().toLowerCase();
        let drawWidth = boxWidth;
        let drawHeight = boxHeight;

        if (fit === "contain") {
            const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
            drawWidth = imageWidth * scale;
            drawHeight = imageHeight * scale;
        } else if (fit === "cover") {
            const scale = Math.max(boxWidth / imageWidth, boxHeight / imageHeight);
            drawWidth = imageWidth * scale;
            drawHeight = imageHeight * scale;
        } else if (fit === "none") {
            drawWidth = imageWidth;
            drawHeight = imageHeight;
        } else if (fit === "scale-down") {
            const containScale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight, 1);
            drawWidth = imageWidth * containScale;
            drawHeight = imageHeight * containScale;
        }

        const objectPosition = (styles.objectPosition || "50% 50%").trim();
        const [posXToken, posYToken = posXToken] = objectPosition.split(/\s+/);
        const x = LiquidGlassFilter.parsePositionToken(posXToken, boxWidth - drawWidth, "x");
        const y = LiquidGlassFilter.parsePositionToken(posYToken, boxHeight - drawHeight, "y");

        return { x, y, width: drawWidth, height: drawHeight };
    }

    constructor(element, options = {}) {
        this.element = element;
        this.sourceSelector = options.sourceSelector || element.dataset.glassSource || "";
        this.mode = options.renderMode && options.renderMode !== "auto" ? options.renderMode : (LiquidGlassFilter.prefersNativeBackdrop() ? "native" : "webgl");
        this.options = {
            surfaceType: options.surfaceType || "convex_squircle",
            bezelWidth: options.bezelWidth || 30,
            glassThickness: options.glassThickness || 100,
            refractiveIndex: options.refractiveIndex || 1.5,
            refractionScale: options.refractionScale || 1.1,
            specularOpacity: options.specularOpacity || 0.6,
            blur: options.blur || 0.5,
            cssBlur: options.cssBlur || 12,
            nativeBackdropBlur: options.nativeBackdropBlur || 10,
            canvasBlur: options.canvasBlur || 1.1,
            saturate: options.saturate || 1.14,
            brightness: options.brightness || 1.1,
            contrast: options.contrast || 1.02,
            edgeRadius: options.edgeRadius || 24,
            transitionSyncDuration: options.transitionSyncDuration || 700,
            ...options
        };

        this.filterId = "liquid-glass-filter-" + Math.random().toString(36).slice(2, 11);
        this.buildRaf = null;
        this.renderRaf = null;
        this.temporarySyncRaf = null;

        try {
            if (this.mode === "webgl") {
                this.sourceElement = this.resolveSourceElement();
                if (!this.sourceElement) {
                    return;
                }
            }

            this.setupSvgContainer();

            if (this.mode === "webgl") {
                this.setupLayers();
                this.setupWebGL();
            }

            this.element._liquidGlassInstance = this;
            LiquidGlassFilter.instances.add(this);
            LiquidGlassFilter.attachGlobalListeners();

            this.buildEffect();
            this.setupObservers();

            if (this.mode === "webgl") {
                this.setupTransitionSync();
            }
        } catch (error) {
            console.error("Liquid glass initialization failed.", error);
            this.disableEnhancement();
        }
    }

    resolveSourceElement() {
        const selector = this.sourceSelector.trim();
        if (!selector) {
            return null;
        }

        const ancestorMatch = this.element.closest(selector);
        if (ancestorMatch && ancestorMatch !== this.element) {
            return ancestorMatch;
        }

        const parentGlass = this.element.parentElement ? this.element.parentElement.closest(".glass-panel") : null;
        if (parentGlass) {
            const scopedMatch = parentGlass.querySelector(selector);
            if (scopedMatch && scopedMatch !== this.element) {
                return scopedMatch;
            }
        }

        const nearestSection = this.element.closest("section, main, article, body");
        if (nearestSection) {
            const sectionMatch = nearestSection.querySelector(selector);
            if (sectionMatch && sectionMatch !== this.element) {
                return sectionMatch;
            }
        }

        const globalMatch = document.querySelector(selector);
        return globalMatch && globalMatch !== this.element ? globalMatch : null;
    }

    setupSvgContainer() {
        if (!document.getElementById("liquid-glass-svg-container")) {
            const container = document.createElement("div");
            container.id = "liquid-glass-svg-container";
            container.style.position = "absolute";
            container.style.width = "0";
            container.style.height = "0";
            container.style.overflow = "hidden";
            container.style.pointerEvents = "none";
            document.body.appendChild(container);
        }

        this.svgContainer = document.getElementById("liquid-glass-svg-container");
    }

    setupLayers() {
        this.element.classList.add("glass-enhanced");

        this.backdropLayer = document.createElement("div");
        this.backdropLayer.className = "glass-backdrop-layer";

        this.tintLayer = document.createElement("div");
        this.tintLayer.className = "glass-tint-layer";

        this.specularLayer = document.createElement("div");
        this.specularLayer.className = "glass-specular-layer";

        this.contentLayer = document.createElement("div");
        this.contentLayer.className = "glass-content-layer";

        const fragment = document.createDocumentFragment();
        while (this.element.firstChild) {
            fragment.appendChild(this.element.firstChild);
        }

        this.contentLayer.appendChild(fragment);
        this.element.append(this.backdropLayer, this.tintLayer, this.specularLayer, this.contentLayer);
    }

    setupWebGL() {
        this.renderCanvas = document.createElement("canvas");
        this.renderCanvas.className = "glass-render-surface";
        this.renderCanvas.setAttribute("aria-hidden", "true");
        this.backdropLayer.appendChild(this.renderCanvas);

        this.captureCanvas = document.createElement("canvas");
        this.captureContext = this.captureCanvas.getContext("2d");
        this.captureContext.imageSmoothingEnabled = true;
        this.captureContext.imageSmoothingQuality = "high";

        this.gl = this.renderCanvas.getContext("webgl", {
            alpha: true,
            antialias: true,
            premultipliedAlpha: true
        });

        if (!this.gl) {
            throw new Error("WebGL is unavailable.");
        }

        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;

            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;

        const fragmentShaderSource = `
            precision mediump float;

            varying vec2 v_texCoord;
            uniform sampler2D u_source;
            uniform sampler2D u_displacement;
            uniform sampler2D u_specular;
            uniform vec2 u_resolution;
            uniform float u_strength;
            uniform float u_blur;
            uniform float u_saturation;
            uniform float u_brightness;
            uniform float u_contrast;

            vec3 tone(vec3 color) {
                float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
                vec3 saturated = mix(vec3(luminance), color, u_saturation);
                vec3 contrasted = (saturated - 0.5) * u_contrast + 0.5;
                return contrasted * u_brightness;
            }

            void main() {
                vec2 displacement = (texture2D(u_displacement, v_texCoord).rg - vec2(0.5)) * 2.0;
                float edge = clamp(length(displacement), 0.0, 1.0);
                vec2 offset = displacement * (u_strength / u_resolution);
                vec2 blurStep = vec2(u_blur) / u_resolution;

                vec4 center = texture2D(u_source, clamp(v_texCoord, 0.001, 0.999));
                vec4 sample0 = texture2D(u_source, clamp(v_texCoord + offset, 0.001, 0.999));
                vec4 sample1 = texture2D(u_source, clamp(v_texCoord + offset + vec2(blurStep.x, 0.0), 0.001, 0.999));
                vec4 sample2 = texture2D(u_source, clamp(v_texCoord + offset - vec2(blurStep.x, 0.0), 0.001, 0.999));
                vec4 sample3 = texture2D(u_source, clamp(v_texCoord + offset + vec2(0.0, blurStep.y), 0.001, 0.999));
                vec4 sample4 = texture2D(u_source, clamp(v_texCoord + offset - vec2(0.0, blurStep.y), 0.001, 0.999));
                vec4 sample5 = texture2D(u_source, clamp(v_texCoord + offset + vec2(blurStep.x, blurStep.y), 0.001, 0.999));
                vec4 sample6 = texture2D(u_source, clamp(v_texCoord + offset + vec2(-blurStep.x, blurStep.y), 0.001, 0.999));
                vec4 sample7 = texture2D(u_source, clamp(v_texCoord + offset + vec2(blurStep.x, -blurStep.y), 0.001, 0.999));
                vec4 sample8 = texture2D(u_source, clamp(v_texCoord + offset + vec2(-blurStep.x, -blurStep.y), 0.001, 0.999));

                vec4 refracted = sample0 * 0.28
                    + sample1 * 0.11 + sample2 * 0.11
                    + sample3 * 0.11 + sample4 * 0.11
                    + sample5 * 0.07 + sample6 * 0.07
                    + sample7 * 0.07 + sample8 * 0.07;
                vec4 base = mix(center, refracted, smoothstep(0.04, 0.32, edge));
                vec3 shaded = tone(base.rgb);
                vec4 spec = texture2D(u_specular, v_texCoord);
                vec3 combined = min(shaded + spec.rgb * spec.a * 0.85, 1.0);

                gl_FragColor = vec4(combined, base.a);
            }
        `;

        this.program = this.createProgram(vertexShaderSource, fragmentShaderSource);
        this.gl.useProgram(this.program);

        const positions = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1
        ]);

        const texCoords = new Float32Array([
            0, 1,
            1, 1,
            0, 0,
            1, 0
        ]);

        this.positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

        const positionLocation = this.gl.getAttribLocation(this.program, "a_position");
        this.gl.enableVertexAttribArray(positionLocation);
        this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);

        this.texCoordBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);

        const texCoordLocation = this.gl.getAttribLocation(this.program, "a_texCoord");
        this.gl.enableVertexAttribArray(texCoordLocation);
        this.gl.vertexAttribPointer(texCoordLocation, 2, this.gl.FLOAT, false, 0, 0);

        this.sourceTexture = this.createTexture();
        this.displacementTexture = this.createTexture();
        this.specularTexture = this.createTexture();

        this.uniforms = {
            source: this.gl.getUniformLocation(this.program, "u_source"),
            displacement: this.gl.getUniformLocation(this.program, "u_displacement"),
            specular: this.gl.getUniformLocation(this.program, "u_specular"),
            resolution: this.gl.getUniformLocation(this.program, "u_resolution"),
            strength: this.gl.getUniformLocation(this.program, "u_strength"),
            blur: this.gl.getUniformLocation(this.program, "u_blur"),
            saturation: this.gl.getUniformLocation(this.program, "u_saturation"),
            brightness: this.gl.getUniformLocation(this.program, "u_brightness"),
            contrast: this.gl.getUniformLocation(this.program, "u_contrast")
        };
    }

    createProgram(vertexShaderSource, fragmentShaderSource) {
        const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
        const program = this.gl.createProgram();

        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            throw new Error(this.gl.getProgramInfoLog(program) || "Failed to link WebGL program.");
        }

        return program;
    }

    compileShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            throw new Error(this.gl.getShaderInfoLog(shader) || "Failed to compile WebGL shader.");
        }

        return shader;
    }

    createTexture() {
        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        return texture;
    }

    updateTexture(texture, source) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, source);
    }

    setupObservers() {
        this.resizeObserver = new ResizeObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.target === this.element) {
                    this.scheduleBuild();
                } else if (this.mode === "webgl") {
                    this.scheduleRender();
                }
            });
        });

        this.resizeObserver.observe(this.element);

        if (this.mode === "webgl" && this.sourceElement) {
            this.resizeObserver.observe(this.sourceElement);
        }

        if (this.mode === "webgl" && this.sourceElement instanceof HTMLImageElement) {
            if (this.sourceElement.complete) {
                this.scheduleRender();
            } else {
                this.sourceElement.addEventListener("load", () => this.scheduleRender(), { once: true });
            }
        }
    }

    setupTransitionSync() {
        if (this.sourceElement instanceof HTMLImageElement) {
            const startSync = () => this.startTemporarySync(this.options.transitionSyncDuration);
            this.sourceElement.addEventListener("transitionrun", startSync);
            this.sourceElement.addEventListener("transitionstart", startSync);
            this.sourceElement.addEventListener("transitionend", () => this.scheduleRender());
        }

        const productCard = this.element.closest(".product-card");
        if (productCard) {
            const startSync = () => this.startTemporarySync(this.options.transitionSyncDuration);
            productCard.addEventListener("mouseenter", startSync);
            productCard.addEventListener("mouseleave", startSync);
        }
    }

    handleViewportChange() {
        if (this.mode === "webgl") {
            this.scheduleRender();
        }
    }

    startTemporarySync(duration = 700) {
        if (this.temporarySyncRaf) {
            window.cancelAnimationFrame(this.temporarySyncRaf);
            this.temporarySyncRaf = null;
        }

        const startedAt = performance.now();

        const tick = (timestamp) => {
            this.renderWebGL();

            if (timestamp - startedAt < duration) {
                this.temporarySyncRaf = window.requestAnimationFrame(tick);
            } else {
                this.temporarySyncRaf = null;
            }
        };

        this.temporarySyncRaf = window.requestAnimationFrame(tick);
    }

    scheduleBuild() {
        if (this.buildRaf) {
            return;
        }

        this.buildRaf = window.requestAnimationFrame(() => {
            this.buildRaf = null;
            this.buildEffect();
        });
    }

    scheduleRender() {
        if (this.mode !== "webgl" || this.renderRaf) {
            return;
        }

        this.renderRaf = window.requestAnimationFrame(() => {
            this.renderRaf = null;
            this.renderWebGL();
        });
    }

    measureElement() {
        const rect = this.element.getBoundingClientRect();
        return {
            width: Math.max(10, Math.round(rect.width)),
            height: Math.max(10, Math.round(rect.height))
        };
    }

    buildEffect() {
        if (this.mode === "native") {
            this.buildNativeFilter();
            return;
        }

        this.buildWebGLAssets();
        this.renderWebGL();
    }

    buildNativeFilter() {
        const { width, height } = this.measureElement();
        if (width <= 10 && height <= 10) {
            return;
        }

        const precomputed1D = this.calculateDisplacementMap1D();
        const displacementCanvas = this.calculateDisplacementCanvas(width, height, precomputed1D);
        const specularCanvas = this.calculateSpecularCanvas(width, height);
        const svgContent = `
            <svg id="${this.filterId}-svg" width="0" height="0">
                <defs>
                    <filter id="${this.filterId}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="${this.options.blur}" result="blurred" />
                        <feImage href="${displacementCanvas.toDataURL()}" x="0" y="0" width="${width}" height="${height}" result="displacement_map" preserveAspectRatio="none" />
                        <feDisplacementMap in="blurred" in2="displacement_map" scale="${this._maxDisplacement}" xChannelSelector="R" yChannelSelector="G" result="displaced" />
                        <feColorMatrix in="displaced" type="saturate" values="1.2" result="displaced_saturated" />
                        <feImage href="${specularCanvas.toDataURL()}" x="0" y="0" width="${width}" height="${height}" result="specular_layer" preserveAspectRatio="none" />
                        <feComponentTransfer in="specular_layer" result="specular_faded">
                            <feFuncA type="linear" slope="${this.options.specularOpacity}" />
                        </feComponentTransfer>
                        <feBlend in="specular_faded" in2="displaced_saturated" mode="screen" />
                    </filter>
                </defs>
            </svg>
        `;

        const existingSvg = document.getElementById(`${this.filterId}-svg`);
        if (existingSvg) {
            existingSvg.remove();
        }

        const wrapper = document.createElement("div");
        wrapper.innerHTML = svgContent.trim();
        this.svgContainer.appendChild(wrapper.firstChild);

        this.element.style.backdropFilter = `url(#${this.filterId})`;
        this.element.style.webkitBackdropFilter = this.element.style.backdropFilter;
    }

    buildWebGLAssets() {
        const { width, height } = this.measureElement();
        if (width <= 10 && height <= 10) {
            return;
        }

        if (this.renderCanvas.width !== width || this.renderCanvas.height !== height) {
            this.renderCanvas.width = width;
            this.renderCanvas.height = height;
            this.captureCanvas.width = width;
            this.captureCanvas.height = height;
        } else {
            this.captureContext.clearRect(0, 0, width, height);
        }

        const precomputed1D = this.calculateDisplacementMap1D();
        const displacementCanvas = this.calculateDisplacementCanvas(width, height, precomputed1D);
        const specularCanvas = this.calculateSpecularCanvas(width, height);

        this.updateTexture(this.displacementTexture, displacementCanvas);
        this.updateTexture(this.specularTexture, specularCanvas);

        this.gl.viewport(0, 0, width, height);
        this.gl.useProgram(this.program);
        this.gl.uniform2f(this.uniforms.resolution, width, height);
        this.gl.uniform1f(this.uniforms.strength, this._maxDisplacement);
        this.gl.uniform1f(this.uniforms.blur, this.options.canvasBlur);
        this.gl.uniform1f(this.uniforms.saturation, this.options.saturate);
        this.gl.uniform1f(this.uniforms.brightness, this.options.brightness);
        this.gl.uniform1f(this.uniforms.contrast, this.options.contrast);
    }

    getSourceDescriptor() {
        if (!this.sourceElement || !this.sourceElement.isConnected) {
            return null;
        }

        if (this.sourceElement.classList.contains("glass-panel")) {
            return {
                type: "glass",
                element: this.sourceElement
            };
        }

        if (this.sourceElement instanceof HTMLImageElement) {
            return {
                type: "image",
                element: this.sourceElement
            };
        }

        const styles = window.getComputedStyle(this.sourceElement);
        if (styles.backgroundImage && styles.backgroundImage !== "none") {
            return {
                type: "background",
                element: this.sourceElement,
                styles
            };
        }

        return null;
    }

    captureSourceToCanvas() {
        if (!this.captureContext) {
            return null;
        }

        const descriptor = this.getSourceDescriptor();
        if (!descriptor) {
            return null;
        }

        const { width, height } = this.measureElement();
        this.captureContext.clearRect(0, 0, width, height);

        if (descriptor.type === "background") {
            return this.drawBackgroundSource(descriptor) ? this.captureCanvas : null;
        }

        if (descriptor.type === "image") {
            return this.drawImageSource(descriptor.element) ? this.captureCanvas : null;
        }

        if (descriptor.type === "glass") {
            return this.drawGlassSource(descriptor.element) ? this.captureCanvas : null;
        }

        return null;
    }

    drawBackgroundSource(descriptor) {
        const backgroundUrl = LiquidGlassFilter.extractFirstUrl(descriptor.styles.backgroundImage);
        const image = LiquidGlassFilter.getCachedImage(backgroundUrl, () => this.scheduleRender());
        if (!image) {
            return false;
        }

        const sourceRect = descriptor.element.getBoundingClientRect();
        const targetRect = this.element.getBoundingClientRect();
        const drawRect = LiquidGlassFilter.computeBackgroundDrawRect(descriptor.styles, sourceRect.width, sourceRect.height, image.naturalWidth, image.naturalHeight);

        this.captureContext.drawImage(
            image,
            (sourceRect.left - targetRect.left) + drawRect.x,
            (sourceRect.top - targetRect.top) + drawRect.y,
            drawRect.width,
            drawRect.height
        );

        return true;
    }

    drawImageSource(sourceImage) {
        if (!sourceImage.complete || !sourceImage.naturalWidth) {
            sourceImage.addEventListener("load", () => this.scheduleRender(), { once: true });
            return false;
        }

        const sourceRect = sourceImage.getBoundingClientRect();
        const targetRect = this.element.getBoundingClientRect();
        const styles = window.getComputedStyle(sourceImage);
        const drawRect = LiquidGlassFilter.computeObjectFitDrawRect(
            styles,
            sourceRect.width,
            sourceRect.height,
            sourceImage.naturalWidth,
            sourceImage.naturalHeight
        );
        const left = sourceRect.left - targetRect.left;
        const top = sourceRect.top - targetRect.top;

        this.captureContext.save();
        this.captureContext.beginPath();
        this.captureContext.rect(left, top, sourceRect.width, sourceRect.height);
        this.captureContext.clip();
        this.captureContext.drawImage(
            sourceImage,
            left + drawRect.x,
            top + drawRect.y,
            drawRect.width,
            drawRect.height
        );
        this.captureContext.restore();

        return true;
    }

    drawGlassSource(sourcePanel) {
        const sourceInstance = sourcePanel._liquidGlassInstance;
        if (!sourceInstance || sourceInstance === this) {
            return false;
        }

        const sourceCanvas = sourceInstance.renderCanvas || sourceInstance.captureSourceToCanvas();
        if (!sourceCanvas) {
            return false;
        }

        const sourceRect = sourcePanel.getBoundingClientRect();
        const targetRect = this.element.getBoundingClientRect();

        this.captureContext.drawImage(
            sourceCanvas,
            sourceRect.left - targetRect.left,
            sourceRect.top - targetRect.top,
            sourceRect.width,
            sourceRect.height
        );

        return true;
    }

    renderWebGL() {
        if (this.mode !== "webgl" || !this.gl) {
            return;
        }

        const sourceCanvas = this.captureSourceToCanvas();
        if (!sourceCanvas) {
            return;
        }

        this.updateTexture(this.sourceTexture, sourceCanvas);

        this.gl.useProgram(this.program);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
        this.gl.uniform1i(this.uniforms.source, 0);

        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.displacementTexture);
        this.gl.uniform1i(this.uniforms.displacement, 1);

        this.gl.activeTexture(this.gl.TEXTURE2);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.specularTexture);
        this.gl.uniform1i(this.uniforms.specular, 2);

        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    calculateDisplacementMap1D(samples = 128) {
        const eta = 1 / this.options.refractiveIndex;
        const surfaceFn = MathUtils[this.options.surfaceType];

        function refract(normalX, normalY) {
            const dot = normalY;
            const k = 1 - eta * eta * (1 - dot * dot);
            if (k < 0) {
                return null;
            }

            const kSqrt = Math.sqrt(k);
            return [
                -(eta * dot + kSqrt) * normalX,
                eta - (eta * dot + kSqrt) * normalY
            ];
        }

        const result = [];

        for (let i = 0; i < samples; i++) {
            const x = i / samples;
            const y = surfaceFn(x);
            const dx = x < 1 ? 0.0001 : -0.0001;
            const y2 = surfaceFn(Math.max(0, Math.min(1, x + dx)));
            const derivative = (y2 - y) / dx;
            const magnitude = Math.sqrt(derivative * derivative + 1);
            const normal = [-derivative / magnitude, -1 / magnitude];
            const refracted = refract(normal[0], normal[1]);

            if (!refracted) {
                result.push(0);
                continue;
            }

            const remainingHeightOnBezel = y * this.options.bezelWidth;
            const remainingHeight = remainingHeightOnBezel + this.options.glassThickness;
            result.push(refracted[0] * (remainingHeight / refracted[1]));
        }

        return result;
    }

    calculateDisplacementCanvas(width, height, precomputed1D) {
        const imageData = new ImageData(width, height);
        const radius = this.options.edgeRadius;
        const bezelWidth = this.options.bezelWidth;
        const maximumDisplacement = Math.max(...precomputed1D.map(Math.abs)) || 1;
        this._maxDisplacement = maximumDisplacement * this.options.refractionScale || 1;

        for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = 128;
            imageData.data[i + 1] = 128;
            imageData.data[i + 2] = 0;
            imageData.data[i + 3] = 255;
        }

        const r2 = radius * radius;
        const rPlus1Sq = (radius + 1) * (radius + 1);
        const rMinusBezelSq = Math.max(0, (radius - bezelWidth) * (radius - bezelWidth));
        const centerW = width - radius * 2;
        const centerH = height - radius * 2;

        for (let y1 = 0; y1 < height; y1++) {
            for (let x1 = 0; x1 < width; x1++) {
                const idx = (y1 * width + x1) * 4;
                const onLeft = x1 < radius;
                const onRight = x1 >= width - radius;
                const onTop = y1 < radius;
                const onBottom = y1 >= height - radius;
                const x = onLeft ? x1 - radius : (onRight ? x1 - radius - centerW : 0);
                const y = onTop ? y1 - radius : (onBottom ? y1 - radius - centerH : 0);
                const distSq = x * x + y * y;
                const isInBezel = distSq <= rPlus1Sq && distSq >= rMinusBezelSq;

                if (!isInBezel) {
                    continue;
                }

                const distToCenter = Math.sqrt(distSq);
                const opacity = distSq < r2 ? 1 : 1 - (distToCenter - Math.sqrt(r2)) / (Math.sqrt(rPlus1Sq) - Math.sqrt(r2));
                const distFromSide = radius - distToCenter;
                const cos = distToCenter > 0 ? x / distToCenter : 0;
                const sin = distToCenter > 0 ? y / distToCenter : 0;
                const bezelRatio = Math.max(0, Math.min(1, distFromSide / bezelWidth));
                const bezelIdx = Math.floor(bezelRatio * precomputed1D.length);
                const safeIdx = Math.max(0, Math.min(bezelIdx, precomputed1D.length - 1));
                const displacementMag = precomputed1D[safeIdx] || 0;
                const dX = (-cos * displacementMag) / maximumDisplacement;
                const dY = (-sin * displacementMag) / maximumDisplacement;

                imageData.data[idx] = Math.max(0, Math.min(255, 128 + dX * 127 * opacity));
                imageData.data[idx + 1] = Math.max(0, Math.min(255, 128 + dY * 127 * opacity));
                imageData.data[idx + 2] = 0;
                imageData.data[idx + 3] = 255;
            }
        }

        return this.imageDataToCanvas(imageData);
    }

    calculateSpecularCanvas(width, height) {
        const imageData = new ImageData(width, height);
        const radius = this.options.edgeRadius;
        const specularAngle = Math.PI * 1.25;
        const specVec = [Math.cos(specularAngle), Math.sin(specularAngle)];
        const specThickness = 2.0;
        const r2 = radius * radius;
        const rPlus1Sq = (radius + 1) * (radius + 1);
        const rMinusSpecSq = Math.max(0, (radius - specThickness) * (radius - specThickness));
        const centerW = width - radius * 2;
        const centerH = height - radius * 2;

        for (let y1 = 0; y1 < height; y1++) {
            for (let x1 = 0; x1 < width; x1++) {
                const idx = (y1 * width + x1) * 4;
                const onLeft = x1 < radius;
                const onRight = x1 >= width - radius;
                const onTop = y1 < radius;
                const onBottom = y1 >= height - radius;
                const x = onLeft ? x1 - radius : (onRight ? x1 - radius - centerW : 0);
                const y = onTop ? y1 - radius : (onBottom ? y1 - radius - centerH : 0);
                const distSq = x * x + y * y;
                const isNearEdge = distSq <= rPlus1Sq && distSq >= rMinusSpecSq;

                if (!isNearEdge) {
                    continue;
                }

                const distToCenter = Math.sqrt(distSq);
                const distFromSide = radius - distToCenter;
                const opacity = distSq < r2 ? 1 : 1 - (distToCenter - Math.sqrt(r2)) / (Math.sqrt(rPlus1Sq) - Math.sqrt(r2));
                const cos = distToCenter > 0 ? x / distToCenter : 0;
                const sin = distToCenter > 0 ? -y / distToCenter : 0;
                const dot = Math.max(0, cos * specVec[0] + sin * specVec[1]);
                const edgeRatio = Math.max(0, Math.min(1, distFromSide / specThickness));
                const sharpFalloff = Math.sqrt(1 - (1 - edgeRatio) * (1 - edgeRatio));
                const coeff = dot * sharpFalloff;
                const color = Math.min(255, 255 * coeff);
                const finalOpacity = Math.min(255, color * coeff * opacity * this.options.specularOpacity);

                imageData.data[idx] = color;
                imageData.data[idx + 1] = color;
                imageData.data[idx + 2] = color;
                imageData.data[idx + 3] = finalOpacity;
            }
        }

        return this.imageDataToCanvas(imageData);
    }

    imageDataToCanvas(imageData) {
        const canvas = document.createElement("canvas");
        canvas.width = imageData.width;
        canvas.height = imageData.height;

        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("2D canvas context is unavailable.");
        }

        context.putImageData(imageData, 0, 0);
        return canvas;
    }

    disableEnhancement() {
        LiquidGlassFilter.instances.delete(this);

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        if (this.buildRaf) {
            window.cancelAnimationFrame(this.buildRaf);
        }

        if (this.renderRaf) {
            window.cancelAnimationFrame(this.renderRaf);
        }

        if (this.temporarySyncRaf) {
            window.cancelAnimationFrame(this.temporarySyncRaf);
        }

        if (this.mode === "webgl" && this.contentLayer && this.contentLayer.isConnected) {
            const fragment = document.createDocumentFragment();
            while (this.contentLayer.firstChild) {
                fragment.appendChild(this.contentLayer.firstChild);
            }

            this.element.replaceChildren(fragment);
        }

        if (this.filterId) {
            const existingSvg = document.getElementById(`${this.filterId}-svg`);
            if (existingSvg) {
                existingSvg.remove();
            }
        }

        if (this.element) {
            this.element.classList.remove("glass-enhanced");
            this.element.style.backdropFilter = "";
            this.element.style.webkitBackdropFilter = "";
            delete this.element._liquidGlassInstance;
        }
    }
}
