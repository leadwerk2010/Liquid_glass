document.addEventListener("DOMContentLoaded", () => {
    const activeEngine = LiquidGlassFilter.detectEngine();
    const panels = document.querySelectorAll(".glass-panel");
    const glassProfiles = {
        panel: {
            surfaceType: "convex_squircle",
            bezelWidth: 34,
            glassThickness: 54,
            refractionScale: 0.88,
            specularOpacity: 0.7,
            saturate: 1.22,
            brightness: 1.08,
            contrast: 1.06,
            edgeRadius: 24,
            blur: 0.4,
            canvasBlur: 2.2
        },
        button: {
            surfaceType: "lip",
            bezelWidth: 11,
            glassThickness: 18,
            refractionScale: 0.5,
            specularOpacity: 0.96,
            saturate: 1.14,
            brightness: 1.05,
            contrast: 1.03,
            edgeRadius: 12,
            blur: 0.12,
            canvasBlur: 1.25
        }
    };

    panels.forEach((panel) => {
        const isButton = panel.classList.contains("glass-button");
        const profile = isButton ? glassProfiles.button : glassProfiles.panel;

        new LiquidGlassFilter(panel, {
            engine: "auto",
            surfaceType: profile.surfaceType,
            bezelWidth: profile.bezelWidth,
            glassThickness: profile.glassThickness,
            refractionScale: profile.refractionScale,
            specularOpacity: profile.specularOpacity,
            blur: activeEngine === "svg" ? profile.blur : 0.4,
            canvasBlur: activeEngine === "webgl" ? profile.canvasBlur : 0.8,
            saturate: profile.saturate,
            brightness: profile.brightness,
            contrast: profile.contrast,
            edgeRadius: isButton ? (panel.classList.contains("btn-favorite") ? 20 : profile.edgeRadius) : profile.edgeRadius
        });
    });

    LiquidGlassFilter.scheduleAllSync();

    const favoriteBtn = document.getElementById("favorite-btn");
    if (favoriteBtn) {
        favoriteBtn.addEventListener("click", (event) => {
            event.preventDefault();
            favoriteBtn.classList.toggle("filled");
            favoriteBtn.classList.remove("animate-pulse");
            void favoriteBtn.offsetWidth;
            favoriteBtn.classList.add("animate-pulse");
        });
    }

    const authForm = document.getElementById("auth-form");
    const authPanelTitle = document.getElementById("auth-panel-title");
    const authSubmitButton = document.getElementById("auth-submit-button");
    const authSwitchLabel = document.getElementById("auth-switch-label");
    const authSwitchLink = document.getElementById("auth-switch-link");
    const navLoginButton = document.querySelector(".btn-nav-login");
    const closeButtons = document.querySelectorAll(".btn-close");
    const modeOnlyFields = authForm ? authForm.querySelectorAll("[data-auth-mode-only]") : [];
    const modeRequiredInputs = authForm ? authForm.querySelectorAll("[data-auth-required]") : [];

    function setLayeredText(element, value) {
        if (!element) {
            return;
        }

        const contentLayer = element.querySelector(":scope > .glass-content-layer");
        if (contentLayer) {
            contentLayer.textContent = value;
            return;
        }

        element.textContent = value;
    }

    function setAuthMode(mode) {
        if (!authForm || !authPanelTitle || !authSubmitButton || !authSwitchLabel || !authSwitchLink) {
            return;
        }

        const isRegisterMode = mode === "register";
        authForm.dataset.authMode = isRegisterMode ? "register" : "login";
        authPanelTitle.textContent = isRegisterMode ? "Registration" : "Login";
        setLayeredText(authSubmitButton, isRegisterMode ? "Register" : "Login");
        authSwitchLabel.textContent = isRegisterMode ? "Already have an account?" : "Don't have an account?";
        authSwitchLink.textContent = isRegisterMode ? "Login" : "Register";

        modeOnlyFields.forEach((field) => {
            const isVisible = field.dataset.authModeOnly === mode;
            field.hidden = !isVisible;
            field.querySelectorAll("input").forEach((input) => {
                if (isVisible) {
                    return;
                }

                if (input.type === "checkbox") {
                    input.checked = false;
                } else {
                    input.value = "";
                }
            });
        });

        modeRequiredInputs.forEach((input) => {
            input.required = input.dataset.authRequired === mode;
        });

        LiquidGlassFilter.scheduleAllSync();
    }

    if (authForm) {
        authForm.addEventListener("submit", (event) => {
            event.preventDefault();
        });
    }

    if (authSwitchLink) {
        authSwitchLink.addEventListener("click", (event) => {
            event.preventDefault();
            const nextMode = authForm && authForm.dataset.authMode === "register" ? "login" : "register";
            setAuthMode(nextMode);
        });
    }

    if (navLoginButton) {
        navLoginButton.addEventListener("click", (event) => {
            event.preventDefault();
            setAuthMode("login");
            document.querySelector(".registration-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
            authForm?.querySelector("#email")?.focus();
        });
    }

    closeButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            setAuthMode("login");
            authForm?.querySelector("#email")?.focus();
        });
    });

    setAuthMode("login");
});
