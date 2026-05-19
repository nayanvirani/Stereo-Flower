class stickyAtc extends HTMLElement {
    constructor() {
        super();

        this.productForm = this.querySelector('product-form');

        // bind methods
        this.setStickyHeight = this.setStickyHeight.bind(this);
        this.handleScroll = this.handleScroll.bind(this);
    }

    connectedCallback() {
        if (this.moved) return;

        this.moved = true;

        document.body.appendChild(this);

        // Set initial height
        this.setStickyHeight();

        // Update height on resize breakpoint
        window
            .matchMedia('(max-width: 990px)')
            .addEventListener('change', this.setStickyHeight);

        // Scroll visibility
        this.setActive();

        // Sticky select
        const select = this.querySelector('.custom-sticky-select');

        select?.addEventListener('change', () => {
            this.activeVariant(select.value);
        });

        // Initial variant
        if (select) {
            this.activeVariant(select.value);
        }

        // Listen main product variant change
        subscribe(PUB_SUB_EVENTS.variantChange, ({ data }) => {
            const variant = data?.variant;

            if (!variant) return;

            // Update sticky variant
            this.activeVariant(variant.id);

            // Update sticky dropdown
            if (select) {
                select.value = variant.id;
            }
        });
    }

    disconnectedCallback() {
        window.removeEventListener('scroll', this.handleScroll);
    }

    setStickyHeight() {
        document.documentElement.style.setProperty(
            '--sticky-height',
            `${this.offsetHeight}px`
        );
    }

    setActive() {
        this.cartFunctions = document.querySelector(
            'product-info product-form.product-form .product-form__buttons'
        );

        if (!this.cartFunctions) return;

        window.addEventListener('scroll', this.handleScroll);

        // Initial state
        this.handleScroll();
    }

    handleScroll() {
        if (!this.cartFunctions) return;

        const rect = this.cartFunctions.getBoundingClientRect();

        const isOutOfViewport =
            rect.bottom < 0 || rect.top > window.innerHeight;

        if (isOutOfViewport) {
            this.classList.add('active');
        } else {
            this.classList.remove('active');
        }
    }

    formatMoney(cents, format) {
        if (typeof cents === 'string') {
            cents = cents.replace('.', '');
        }

        let value = '';
        const placeholderRegex = /\{\{\s*(\w+)\s*\}\}/;
        const formatString = format || window.moneyFormat;

        function formatWithDelimiters(
            number,
            precision,
            thousands,
            decimal
        ) {
            thousands = thousands || ',';
            decimal = decimal || '.';

            if (isNaN(number) || number === null) {
                return 0;
            }

            number = (number / 100.0).toFixed(precision);

            const parts = number.split('.');

            const dollarsAmount = parts[0].replace(
                /(\d)(?=(\d\d\d)+(?!\d))/g,
                '$1' + thousands
            );

            const centsAmount = parts[1]
                ? decimal + parts[1]
                : '';

            return dollarsAmount + centsAmount;
        }

        switch (formatString.match(placeholderRegex)[1]) {
            case 'amount':
                value = formatWithDelimiters(cents, 2);
                break;

            case 'amount_no_decimals':
                value = formatWithDelimiters(cents, 0);
                break;

            case 'amount_with_comma_separator':
                value = formatWithDelimiters(cents, 2, '.', ',');
                break;

            case 'amount_no_decimals_with_comma_separator':
                value = formatWithDelimiters(cents, 0, '.', ',');
                break;

            case 'amount_no_decimals_with_space_separator':
                value = formatWithDelimiters(cents, 0, ' ');
                break;

            case 'amount_with_apostrophe_separator':
                value = formatWithDelimiters(cents, 2, "'");
                break;
        }

        return formatString.replace(placeholderRegex, value);
    }

    activeVariant(variantID) {
        const idInput = this.querySelector('[name="id"]');
        const atc = this.querySelector('.quick-add__submit');
        const atcText = this.querySelector('.button__text');

        const jsonScript = this.querySelector('noscript');

        if (!jsonScript) return;

        const jsonData = JSON.parse(jsonScript.textContent);

        const variant = jsonData.variants.find(
            (e) => String(e.id) === String(variantID)
        );

        if (!variant) return;

        // Update button state
        if (!variant.available) {
            atc?.classList.add('disabled');

            this.productForm?.classList.add('disabled-cart');

            if (atcText) {
                atcText.textContent = window.variantStrings.soldOut;
            }
        } else {
            atc?.classList.remove('disabled');

            this.productForm?.classList.remove('disabled-cart');

            if (atcText) {
                atcText.innerHTML = `
                    <span class="button__text">
                        ${window.variantStrings.addToCart}
                    </span>
                `;
            }
        }

        // Update sticky form input
        if (idInput) {
            idInput.value = variant.id;
        }

        // Sync main product form
        const mainForm = document.querySelector(
            'product-info product-form.product-form'
        );

        if (mainForm) {
            const mainInput = mainForm.querySelector(
                'input[name="id"]'
            );

            if (mainInput) {
                mainInput.value = variant.id;

                mainInput.dispatchEvent(
                    new Event('change', {
                        bubbles: true
                    })
                );
            }
        }
    }
}

// Register custom element
customElements.define('sticky-atc', stickyAtc);