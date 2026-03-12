document.addEventListener("DOMContentLoaded", () => {
    const activeEngine = LiquidGlassFilter.detectEngine();
    const panels = document.querySelectorAll(".glass-panel");

    panels.forEach((panel) => {
        const isButton = panel.classList.contains("glass-button");

        new LiquidGlassFilter(panel, {
            engine: "auto",
            surfaceType: isButton ? "lip" : "convex_squircle",
            bezelWidth: activeEngine === "svg" ? (isButton ? 12 : 48) : (isButton ? 11 : 34),
            glassThickness: activeEngine === "svg" ? (isButton ? 20 : 120) : (isButton ? 18 : 54),
            refractionScale: activeEngine === "svg" ? (isButton ? 0.6 : 1.8) : (isButton ? 0.5 : 0.88),
            specularOpacity: activeEngine === "svg" ? (isButton ? 1.2 : 1.1) : (isButton ? 0.96 : 0.7),
            blur: activeEngine === "svg" ? (isButton ? 0.12 : 0.4) : 0.4,
            canvasBlur: activeEngine === "webgl" ? (isButton ? 1.25 : 2.2) : 0.8,
            saturate: activeEngine === "webgl" ? (isButton ? 1.14 : 1.22) : 1.2,
            brightness: activeEngine === "webgl" ? (isButton ? 1.05 : 1.08) : 1.04,
            contrast: activeEngine === "webgl" ? (isButton ? 1.03 : 1.06) : 1.03,
            edgeRadius: isButton ? (panel.classList.contains("btn-favorite") ? 20 : 12) : 24
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
