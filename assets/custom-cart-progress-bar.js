class CustomCartProgressbar extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.currencyRate = Shopify.currency.rate;
        this.title = this.getAttribute("title") || "";
        this.subtitle = this.getAttribute("subtitle") || "";
        
        // Cache cart data to reduce AJAX calls
        this.cachedCartData = null;
        this.lastSyncTime = 0;
        
        // FIXED: Prevent multiple simultaneous operations
        this.isProcessing = false;
        this.processingProductIds = new Set();
        
        // NEW: Track products already added to prevent duplicates
        this.addedThresholdProducts = new Set();
        
        // NEW: Prevent race conditions on initial load
        this.isInitialized = false;
        this.manageProductsDebounceTimer = null;
    }

    connectedCallback() {
        this.render();
        
        // Initialize Shopify sync first, then update progress
        if (typeof Shopify !== 'undefined') {
            this.initShopifySync().then(() => {
                console.log('✅ Initialization complete, now updating progress');
                requestAnimationFrame(() => {
                    this.updateProgress();
                });
            });
        } else {
            console.warn('⚠️ Shopify object not found');
            requestAnimationFrame(() => {
                this.updateProgress();
            });
        }

        // Listen for Dawn theme cart updates
        this.setupDawnCartListeners();
    }

    // NEW: Setup listeners for Dawn theme cart events
    setupDawnCartListeners() {
        // Dawn theme publishes cart updates to the document
        document.addEventListener('cart:updated', () => {
            this.syncWithCart();
        });

        // Listen for cart drawer changes
        document.addEventListener('cart:change', () => {
            this.syncWithCart();
        });
    }

    static get observedAttributes() {
        return [
            'current', 'threshold1', 'threshold2', 'threshold3', 
            'threshold1product', 'threshold2product', 'threshold3product',
            'threshold1message', 'threshold2message', 'threshold3message',
            'threshold1icon', 'threshold2icon', 'threshold3icon',
            'threshold1text', 'threshold2text', 'threshold3text',
            'successmessage', 'title', 'subtitle'
        ];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (!this.shadowRoot) return;
        
        if (oldValue === newValue) return;
        
        if (name === 'title' || name === 'subtitle') {
            this.title = this.getAttribute("title") || "";
            this.subtitle = this.getAttribute("subtitle") || "";
            if (!this.isUpdating) {
                this.render();
            }
        } else {
            this.updateProgress();
        }
    }

    get current() {
        return parseFloat(this.getAttribute('current')) || 0;
    }

    set current(value) {
        this.setAttribute('current', value.toString());
    }

    get thresholds() {
        const baseThresholds = [
            parseFloat(this.getAttribute('threshold1')),
            parseFloat(this.getAttribute('threshold2')),
            parseFloat(this.getAttribute('threshold3'))
        ].filter(val => !isNaN(val));
        
        return baseThresholds.map(threshold => threshold * this.currencyRate);
    }

    get thresholdProducts() {
        const thresholds = this.thresholds;
        const products = [
            this.getAttribute('threshold1product'),
            this.getAttribute('threshold2product'), 
            this.getAttribute('threshold3product')
        ];
        // FIXED: Don't filter - maintain array indices to match thresholds
        // Return null/empty for missing products to preserve index alignment
        return products.slice(0, thresholds.length).map(id => {
            return (id && id.trim() !== '') ? id.trim() : null;
        });
    }

    get thresholdMessages() {
        const thresholds = this.thresholds;
        const messages = [
            this.getAttribute('threshold1message'),
            this.getAttribute('threshold2message'), 
            this.getAttribute('threshold3message')
        ];
        
        return messages.slice(0, thresholds.length);
    }

    get thresholdTexts() {
        const thresholds = this.thresholds;
        const texts = [
            this.getAttribute('threshold1text'),
            this.getAttribute('threshold2text'), 
            this.getAttribute('threshold3text')
        ];
        
        return texts.slice(0, thresholds.length);
    }

    get successMessage() {
        return this.getAttribute('successmessage') || '🎉 All thresholds completed! Maximum rewards unlocked!';
    }

    get thresholdIcons() {
        const thresholds = this.thresholds;
        const icons = [
            this.getAttribute('threshold1icon'),
            this.getAttribute('threshold2icon'), 
            this.getAttribute('threshold3icon')
        ];
        
        return icons.slice(0, thresholds.length).map((icon, index) => {
            if (icon && icon.trim() !== '') {
                return icon.trim();
            }
            return null;
        });
    }

    async getCartData(forceRefresh = false) {
        const now = Date.now();
        
        // FIXED: Increased cache time to prevent multiple rapid fetches
        if (!forceRefresh && this.cachedCartData && (now - this.lastSyncTime) < 3000) {
            return this.cachedCartData;
        }
        
        try {
            const response = await fetch('/cart.js');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.cachedCartData = await response.json();
            this.lastSyncTime = now;
            
            // NEW: Update tracked threshold products from cart
            this.updateTrackedProducts(this.cachedCartData);
            
            return this.cachedCartData;
            
        } catch (error) {
            console.error('Failed to fetch cart data:', error);
            return null;
        }
    }

    // NEW: Update our tracking of which threshold products are in cart
    updateTrackedProducts(cartData) {
        this.addedThresholdProducts.clear();
        if (cartData && cartData.items) {
            cartData.items.forEach(item => {
                if (item.properties && item.properties['_threshold_product'] === 'true') {
                    this.addedThresholdProducts.add(item.variant_id.toString());
                }
            });
        }
        console.log('Tracked threshold products:', Array.from(this.addedThresholdProducts));
    }

    async initShopifySync() {
        try {
            const cartData = await this.getCartData(true);
            if (cartData) {
                const totalDollars = cartData.total_price;
                this.current = totalDollars;
                
                // NEW: Populate tracking set with existing threshold products
                cartData.items.forEach(item => {
                    if (item.properties && item.properties['_threshold_product'] === 'true') {
                        this.addedThresholdProducts.add(item.variant_id.toString());
                        console.log(`📝 Tracking existing threshold product: ${item.variant_id}`);
                    }
                });
                
                console.log("initShopifySync:this.current", this.current, totalDollars);
                console.log("initShopifySync:tracked products", Array.from(this.addedThresholdProducts));
                
                // NEW: Mark as initialized
                this.isInitialized = true;
            }
        } catch (error) {
            console.warn('Shopify cart sync failed:', error);
            this.isInitialized = true; // Mark as initialized even on error
        }
    }

    calculateIconPositions(thresholds) {
        const iconHalfWidth = 4.5;
        const usableWidth = 100 - (iconHalfWidth * 2);
        
        if (thresholds.length === 1) {
            return [80];
        }
        
        if (thresholds.length === 2) {
            return [
                iconHalfWidth + (usableWidth * 0.4),
                iconHalfWidth + (usableWidth * 0.9)
            ];
        }
        
        if (thresholds.length === 3) {
            return [
                iconHalfWidth + (usableWidth * 0.25),
                iconHalfWidth + (usableWidth * 0.55),
                iconHalfWidth + (usableWidth * 0.9)
            ];
        }
        
        return thresholds.map((_, index) => {
            const position = index / (thresholds.length - 1);
            return iconHalfWidth + (usableWidth * position);
        });
    }

    calculateProgressPercentage(current, thresholds) {
        console.log("calculateProgressPercentage:current", current);
        
        if (current <= 0) return 0;
        
        const sortedThresholds = [...thresholds].sort((a, b) => a - b);
        const maxThreshold = Math.max(...sortedThresholds);
        
        if (current >= maxThreshold) return 100;
        
        const iconPositions = this.calculateIconPositions(sortedThresholds);
        
        for (let i = 0; i < sortedThresholds.length; i++) {
            const threshold = sortedThresholds[i];
            
            if (current <= threshold) {
                const segmentStart = i === 0 ? 0 : sortedThresholds[i - 1];
                const segmentEnd = threshold;
                const segmentStartPos = i === 0 ? 0 : iconPositions[i - 1];
                const segmentEndPos = iconPositions[i];
                
                const segmentProgress = (current - segmentStart) / (segmentEnd - segmentStart);
                const progressPercent = segmentStartPos + (segmentProgress * (segmentEndPos - segmentStartPos));
                
                return Math.min(Math.max(progressPercent, 0), 100);
            }
        }
        
        return 100;
    }

    render() {
        const style = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    max-width: 500px;
                }

                .progress-container {
                    background: transparent;
                    color: #fff;
                    padding: 0 0 30px 0;
                    border-radius: 0;
                    position: relative;
                }

                .sale-header {
                    margin-bottom: 20px;
                }

                .sale-header.hidden {
                    display: none;
                }
                
                .sale-title {
                    color: #fff;
                    font-size: 18px;
                    font-weight: bold;
                    margin: 0 0 5px 0;
                    letter-spacing: 1px;
                }

                .sale-subtitle {
                    color: #fff;
                    font-size: 14px;
                    margin: 0;
                    font-weight: bold;
                }

                .thresholds {
                    position: relative;
                    max-width: 100%;
                    margin-bottom: 90px;
                    margin-top: 35px;
                }

                .threshold {
                    position: absolute;
                    top: 45%;
                    transform: translateY(-45%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .threshold-icon {
                    width: 45px;
                    height: 45px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                    border: 3px solid;
                    transition: all 0.4s ease;
                    position: relative;
                    overflow: hidden;
                }

                .threshold-icon img {
                    width: 28px;
                    height: 28px;
                    object-fit: contain;
                    transition: all 0.3s ease;
                }

                .threshold.active .threshold-icon img {
                    transform: scale(1.1);
                }

                .threshold-icon-placeholder {
                    width: 28px;
                    height: 28px;
                    background: currentColor;
                    border-radius: 4px;
                    opacity: 0.7;
                }

                .threshold.inactive .threshold-icon {
                    background: #fff;
                    color: #fff;
                    border-color: #fff;
                }

                .threshold.active .threshold-icon {
                    background: #fff;
                    color: #000;
                    border-color: #000;
                }

                .threshold-text {
                    margin-top: 8px;
                    color: #fff;
                    font-size: 12px;
                    font-weight: 500;
                    text-align: center;
                    line-height: 1.2;
                    max-width: 80px;
                    word-wrap: break-word;
                    transition: all 0.3s ease;
                }

                .threshold.active .threshold-text {
                    color: #000;
                    font-weight: 600;
                }

                .threshold.inactive .threshold-text {
                    color: #fff;
                    opacity: 0.8;
                }

                .offer-text {
                    color: #fff;
                    font-size: 15px;
                    text-align: center;
                    line-height: 1.4;
                    margin-top: 0;
                }

                .progress-line {
                    position: absolute;
                    top: 50%;
                    left: 0;
                    right: 0;
                    height: 8px;
                    background: #fff;
                    z-index: 1;
                }

                .progress-line-fill {
                    height: 100%;
                    background: #000;
                    transition: width 0.8s ease;
                }

                .threshold-icons {
                    position: relative;
                    z-index: 2;
                }
            </style>
        `;

        const hasTitle = this.title && this.title.trim() !== '';
        const hasSubtitle = this.subtitle && this.subtitle.trim() !== '';
        const showHeader = hasTitle || hasSubtitle;

        const html = `
            ${style}
            <div class="progress-container">
                <div class="sale-header ${showHeader ? '' : 'hidden'}">
                    ${hasTitle ? `<div class="sale-title">${this.title}</div>` : ''}
                    ${hasSubtitle ? `<div class="sale-subtitle">${this.subtitle}</div>` : ''}
                </div>
                <div class="offer-text" id="offerText">
                    Add more to unlock your next reward!
                </div>
                <div class="thresholds">
                    <div class="progress-line">
                        <div class="progress-line-fill" id="progressLineFill"></div>
                    </div>
                    <div class="threshold-icons" id="thresholds"></div>
                </div>
            </div>
        `;

        this.shadowRoot.innerHTML = html;
    }

    updateProgress() {
        if (!this.shadowRoot || this.isUpdating) return;
        
        try {
            console.log("updateProgress:this.current", this.current);
            if(this.current > 0){
                this.style.display="block";
            }else{
                this.style.display="none";
            }

            const progressLineFill = this.shadowRoot.getElementById('progressLineFill');
            const offerText = this.shadowRoot.getElementById('offerText');
            
            if (!progressLineFill || !offerText) return;

            const current = this.current/100;
            const thresholds = this.thresholds;
            
            if (thresholds.length === 0) {
                progressLineFill.style.width = '0%';
                this.renderThresholds();
                this.updateOfferText();
                return;
            }
            
            const progressPercent = this.calculateProgressPercentage(current, thresholds);
            progressLineFill.style.width = `${progressPercent}%`;

            this.renderThresholds();
            this.updateOfferText();
            this.manageProducts();
            
        } finally {
        }
    }

    renderThresholds() {
        if (!this.shadowRoot) return;
        
        const thresholdsContainer = this.shadowRoot.getElementById('thresholds');
        if (!thresholdsContainer) return;

        const thresholds = this.thresholds;
        const current = this.current/100;
        const icons = this.thresholdIcons;
        const texts = this.thresholdTexts;
        
        if (thresholds.length === 0) {
            thresholdsContainer.innerHTML = '';
            return;
        }
        
        const sortedThresholds = [...thresholds].sort((a, b) => a - b);
        const iconPositions = this.calculateIconPositions(sortedThresholds);
        
        const thresholdMapping = thresholds.map((threshold, originalIndex) => {
            const sortedIndex = sortedThresholds.indexOf(threshold);
            return { threshold, originalIndex, sortedIndex, position: iconPositions[sortedIndex] };
        }).sort((a, b) => a.sortedIndex - b.sortedIndex);

        thresholdsContainer.innerHTML = thresholdMapping.map(({ threshold, originalIndex, position }) => {
            const isActive = current >= threshold;
            const iconUrl = icons[originalIndex];
            const thresholdText = texts[originalIndex];

            return `
                <div class="threshold ${isActive ? 'active' : 'inactive'}" 
                     style="left: ${position}%">
                    <div class="threshold-icon">
                        ${iconUrl ? 
                            `<img src="${iconUrl}" alt="Threshold ${originalIndex + 1} icon" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                             <div class="threshold-icon-placeholder" style="display:none;"></div>` : 
                            '<div class="threshold-icon-placeholder"></div>'
                        }
                    </div>
                    ${thresholdText && thresholdText.trim() !== '' ? 
                        `<div class="threshold-text">${thresholdText}</div>` : 
                        ''
                    }
                </div>
            `;
        }).join('');
    }

    updateOfferText() {
        if (!this.shadowRoot) return;
        
        const offerText = this.shadowRoot.getElementById('offerText');
        if (!offerText) return;
    
        const current = this.current/100;
        const thresholds = this.thresholds;
        const messages = this.thresholdMessages;
        const successMessage = this.successMessage;
        
        if (thresholds.length === 0) {
            offerText.textContent = "Configure thresholds to unlock product rewards!";
            return;
        }
        
        if (thresholds.length === 1) {
            const threshold = thresholds[0];
            const message = messages[0];
            
            if (current >= threshold) {
                offerText.textContent = successMessage;
            } else {
                const remaining = threshold - current;
                const remainingAmountFormat = Shopify.formatMoney((remaining * 100));
                
                if (message && message.trim() !== '') {
                    const formattedMessage = message.replace(/\*\*AMOUNT\*\*/g, `${remainingAmountFormat}`);
                    offerText.innerHTML = formattedMessage;
                } else {
                    offerText.textContent = `Add ${remainingAmountFormat} more to unlock your reward!`;
                }
            }
            return;
        }
        
        const nextThresholdIndex = thresholds.findIndex(threshold => current < threshold);
        
        if (nextThresholdIndex === -1) {
            offerText.textContent = successMessage;
        } else {
            const nextThreshold = thresholds[nextThresholdIndex];
            const remaining = nextThreshold - current;
            const message = messages[nextThresholdIndex];
    
            const remainingAmountFormat = Shopify.formatMoney((remaining * 100));
            if (message && message.trim() !== '') {
                const formattedMessage = message.replace(/\*\*AMOUNT\*\*/g, `${remainingAmountFormat}`);
                offerText.innerHTML = formattedMessage;
            } else {
                offerText.textContent = `Add ${remainingAmountFormat} more to unlock your next reward!`;
            }
        }
    }

    async manageProducts() {
        // NEW: Wait for initialization to complete
        if (!this.isInitialized) {
            console.log('⏳ Waiting for initialization to complete before managing products');
            return;
        }

        // NEW: Debounce to prevent rapid successive calls
        if (this.manageProductsDebounceTimer) {
            clearTimeout(this.manageProductsDebounceTimer);
        }

        // Wait 300ms before actually executing
        await new Promise(resolve => {
            this.manageProductsDebounceTimer = setTimeout(resolve, 300);
        });

        // FIXED: Prevent multiple simultaneous executions
        if (this.isProcessing) {
            console.log('Already processing, skipping manageProducts');
            return;
        }

        this.isProcessing = true;
        
        try {
            const current = this.current/100;
            const thresholds = this.thresholds;
            const productIds = this.thresholdProducts;

            // FIXED: Force refresh cart data before checking
            const cartData = await this.getCartData(true);
            if (!cartData) {
                console.error('Failed to get cart data');
                return;
            }

            console.log('=== MANAGE PRODUCTS ===');
            console.log('Raw current value:', this.current);
            console.log('Current cart amount (dollars):', current);
            console.log('Cart total_price:', cartData.total_price);
            console.log('Cart items:', cartData.items.length);
            console.log('Thresholds (dollars):', thresholds);

            // Calculate cart amount EXCLUDING threshold products
            let thresholdProductsTotal = 0;
            const currentThresholdProducts = new Map();
            
            cartData.items.forEach(item => {
                if (item.properties && item.properties['_threshold_product'] === 'true') {
                    currentThresholdProducts.set(item.variant_id.toString(), item);
                    thresholdProductsTotal += (item.final_line_price || item.line_price || 0);
                }
            });

            // Cart amount for threshold comparison (excluding threshold products)
            const cartAmountForThresholds = (cartData.total_price - thresholdProductsTotal) / 100;

            console.log('Threshold products total:', thresholdProductsTotal / 100);
            console.log('Cart amount (excluding threshold products):', cartAmountForThresholds);
            console.log('Current threshold products in cart:', Array.from(currentThresholdProducts.keys()));
            console.log('Tracked threshold products:', Array.from(this.addedThresholdProducts));

            const actions = [];

            // NEW: First check for quantity violations and fix them
            currentThresholdProducts.forEach((lineItem, variantId) => {
                if (lineItem.quantity > 1) {
                    console.log(`⚠️ Threshold product ${variantId} has quantity ${lineItem.quantity}, correcting to 1`);
                    actions.push({ 
                        type: 'correct_quantity', 
                        productId: variantId, 
                        lineItem: lineItem,
                        currentQuantity: lineItem.quantity
                    });
                }
            });

            // OPTIMIZATION: Collect all products to add/remove based on CURRENT cart amount
            // This prevents multiple add cycles when cart amount jumps significantly
            const productsToAdd = [];
            const productsToRemove = [];

            for (let index = 0; index < thresholds.length; index++) {
                const threshold = thresholds[index];
                const productId = productIds[index];
                
                // Skip if no product configured for this threshold
                if (!productId) {
                    console.log(`Threshold ${index + 1} has no product configured, skipping`);
                    continue;
                }
                
                // FIXED: Use cart amount EXCLUDING threshold products for comparison
                const shouldHaveProduct = cartAmountForThresholds >= threshold;
                const currentlyHasProduct = currentThresholdProducts.has(productId);
                const isTracked = this.addedThresholdProducts.has(productId);
                const lineItem = currentThresholdProducts.get(productId);

                console.log(`Threshold ${index + 1} ($${threshold}):`, {
                    cartAmount: cartAmountForThresholds,
                    threshold: threshold,
                    shouldHave: shouldHaveProduct,
                    currentlyHas: currentlyHasProduct,
                    isTracked: isTracked,
                    productId: productId,
                    quantity: lineItem ? lineItem.quantity : 0
                });

                if (shouldHaveProduct && !currentlyHasProduct && !isTracked) {
                    // Need to add this product
                    productsToAdd.push({ productId, threshold, index });
                } else if (!shouldHaveProduct && currentlyHasProduct) {
                    // Need to remove this product
                    productsToRemove.push({ productId, threshold, index, lineItem });
                }
            }

            // OPTIMIZATION: Add all qualifying products in ONE batch operation
            if (productsToAdd.length > 0) {
                console.log(`📦 Adding ${productsToAdd.length} threshold products in batch:`, productsToAdd.map(p => p.productId));
                await this.addMultipleThresholdProducts(productsToAdd);
            }

            // Remove products that no longer qualify (one by one is fine for removals)
            for (const removeAction of productsToRemove) {
                console.log(`➖ Removing product ${removeAction.productId}`);
                await this.removeThresholdProduct(removeAction.productId, removeAction.lineItem);
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Execute quantity corrections if needed
            for (const action of actions) {
                if (action.type === 'correct_quantity') {
                    console.log(`🔧 Correcting quantity for product ${action.productId}`);
                    await this.correctThresholdProductQuantity(action.productId, action.lineItem);
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }

            if (productsToAdd.length === 0 && productsToRemove.length === 0 && actions.length === 0) {
                console.log('✅ No actions needed - cart is in sync');
            }

        } catch (error) {
            console.error('Error in manageProducts:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    // NEW: Get cart drawer element
    getCartDrawer() {
        return document.querySelector('cart-drawer') || 
               document.querySelector('cart-notification') ||
               document.querySelector('[data-cart-drawer]');
    }

    // NEW: Publish Dawn theme pub/sub event
    publishCartUpdate(cartData) {
        // Check if Dawn's pub/sub system exists
        if (typeof window.publish === 'function' && typeof window.PUB_SUB_EVENTS !== 'undefined') {
            window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
                source: 'custom-cart-progressbar',
                cartData: cartData
            });
        }
    }

    // NEW: Add multiple threshold products in ONE batch operation
    async addMultipleThresholdProducts(productsToAdd) {
        if (productsToAdd.length === 0) return;

        // Check if any are already being processed or tracked
        const safeToAdd = productsToAdd.filter(p => {
            if (this.processingProductIds.has(p.productId)) {
                console.log(`🚫 Product ${p.productId} already processing, skipping from batch`);
                return false;
            }
            if (this.addedThresholdProducts.has(p.productId)) {
                console.log(`🚫 Product ${p.productId} already tracked, skipping from batch`);
                return false;
            }
            return true;
        });

        if (safeToAdd.length === 0) {
            console.log('No products safe to add in batch');
            return;
        }

        // Mark all as processing
        safeToAdd.forEach(p => {
            this.processingProductIds.add(p.productId);
            this.addedThresholdProducts.add(p.productId);
        });

        try {
            // Double-check cart state with a small delay
            await new Promise(resolve => setTimeout(resolve, 150));
            const cartData = await this.getCartData(true);
            
            // Filter out products that are already in cart
            const finalProductsToAdd = safeToAdd.filter(p => {
                const existsInCart = cartData.items.some(item => 
                    item.variant_id.toString() === p.productId.toString()
                );
                if (existsInCart) {
                    console.log(`✋ Product ${p.productId} already in cart, skipping from batch`);
                    return false;
                }
                return true;
            });

            if (finalProductsToAdd.length === 0) {
                console.log('All products already in cart, batch add cancelled');
                return;
            }

            const cart = this.getCartDrawer();
            
            // Build items array for batch add
            const items = finalProductsToAdd.map(p => ({
                id: p.productId,
                quantity: 1,
                properties: {
                    '_threshold_product': 'true'
                }
            }));

            console.log(`📦 Batch adding ${items.length} products:`, items.map(i => i.id));

            const formdata = {
                items: items,
                sections: cart && cart.getSectionsToRender ? 
                         cart.getSectionsToRender().map((section) => section.id) : [],
                sections_url: window.location.pathname
            };

            const response = await fetch('/cart/add.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formdata)
            });

            const responseData = await response.json();
            
            if (responseData.status) {
                // Error occurred - remove from tracking
                console.error('Error in batch add:', responseData.description);
                finalProductsToAdd.forEach(p => {
                    this.addedThresholdProducts.delete(p.productId);
                });
                
                if (typeof window.publish === 'function' && typeof window.PUB_SUB_EVENTS !== 'undefined') {
                    window.publish(window.PUB_SUB_EVENTS.cartError, {
                        source: 'custom-cart-progressbar',
                        errors: responseData.errors || responseData.description,
                        message: responseData.message
                    });
                }
                return;
            }

            // Success - publish update event
            this.publishCartUpdate(responseData);

            // Render cart contents if cart drawer exists
            if (cart && typeof cart.renderContents === 'function') {
                cart.renderContents(responseData);
            }

            // Remove empty class from cart
            if (cart && cart.classList.contains('is-empty')) {
                cart.classList.remove('is-empty');
            }
            
            console.log(`✅ Successfully batch added ${finalProductsToAdd.length} threshold products`);
            
            // Invalidate cache after successful add
            this.cachedCartData = null;
            
        } catch (error) {
            console.error('❌ Failed batch add:', error);
            // Remove from tracking on error
            safeToAdd.forEach(p => {
                this.addedThresholdProducts.delete(p.productId);
            });
            throw error;
        } finally {
            // Remove from processing set after delay
            setTimeout(() => {
                safeToAdd.forEach(p => {
                    this.processingProductIds.delete(p.productId);
                });
            }, 2000);
        }
    }

    async addThresholdProduct(productId) {
        // FIXED: Multiple layers of duplicate prevention
        
        // Layer 1: Check if already processing this product
        if (this.processingProductIds.has(productId)) {
            console.log(`🚫 Already processing product ${productId}, skipping`);
            return;
        }

        // Layer 2: Check if we've already tracked this as added
        if (this.addedThresholdProducts.has(productId)) {
            console.log(`🚫 Product ${productId} already tracked as added, skipping`);
            return;
        }

        this.processingProductIds.add(productId);

        try {
            // Layer 3: Wait and refresh cart to get latest state
            await new Promise(resolve => setTimeout(resolve, 150));
            const cartData = await this.getCartData(true);
            
            // Layer 4: Check if this exact variant exists with threshold property
            const existingThresholdProduct = cartData.items.find(item => 
                item.variant_id.toString() === productId.toString() &&
                item.properties && 
                item.properties['_threshold_product'] === 'true'
            );
            
            if (existingThresholdProduct) {
                console.log(`✋ Threshold product ${productId} already exists in cart (quantity: ${existingThresholdProduct.quantity}), skipping add`);
                this.addedThresholdProducts.add(productId);
                return;
            }

            // Layer 5: Check if product exists without threshold property (to prevent duplicates)
            const existingRegularProduct = cartData.items.find(item => 
                item.variant_id.toString() === productId.toString()
            );
            
            if (existingRegularProduct) {
                console.log(`⚠️ Product ${productId} already exists in cart as regular item, skipping threshold add`);
                return;
            }

            // Layer 6: Mark as being added BEFORE making the API call
            this.addedThresholdProducts.add(productId);

            const cart = this.getCartDrawer();
            
            // Build request body with sections (Dawn pattern)
            const items = [{
                id: productId,
                quantity: 1,
                properties: {
                    '_threshold_product': 'true'
                }
            }];

            const formdata = {
                items: items,
                sections: cart && cart.getSectionsToRender ? 
                         cart.getSectionsToRender().map((section) => section.id) : [],
                sections_url: window.location.pathname
            };

            const response = await fetch('/cart/add.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formdata)
            });

            const responseData = await response.json();
            
            if (responseData.status) {
                // Error occurred - remove from tracking
                console.error('Error adding threshold product:', responseData.description);
                this.addedThresholdProducts.delete(productId);
                
                // Publish error event if Dawn's pub/sub exists
                if (typeof window.publish === 'function' && typeof window.PUB_SUB_EVENTS !== 'undefined') {
                    window.publish(window.PUB_SUB_EVENTS.cartError, {
                        source: 'custom-cart-progressbar',
                        productVariantId: productId,
                        errors: responseData.errors || responseData.description,
                        message: responseData.message
                    });
                }
                return;
            }

            // Success - publish update event
            this.publishCartUpdate(responseData);

            // Render cart contents if cart drawer exists
            if (cart && typeof cart.renderContents === 'function') {
                cart.renderContents(responseData);
            }

            // Remove empty class from cart
            if (cart && cart.classList.contains('is-empty')) {
                cart.classList.remove('is-empty');
            }
            
            console.log(`✅ Successfully added threshold product ${productId}`);
            
            // FIXED: Invalidate cache after successful add
            this.cachedCartData = null;
            
        } catch (error) {
            console.error(`❌ Failed to add threshold product ${productId}:`, error);
            // Remove from tracking on error
            this.addedThresholdProducts.delete(productId);
            throw error;
        } finally {
            // FIXED: Remove from processing set after delay
            setTimeout(() => {
                this.processingProductIds.delete(productId);
            }, 2000);
        }
    }

    async removeThresholdProduct(productId, lineItem) {
        // FIXED: Prevent removing same product multiple times simultaneously
        if (this.processingProductIds.has(productId)) {
            console.log(`Already processing product ${productId}, skipping`);
            return;
        }

        this.processingProductIds.add(productId);

        try {
            if (!lineItem) {
                console.log(`No line item provided for ${productId}, skipping remove`);
                return;
            }

            const cart = this.getCartDrawer();

            // Build request body with sections (Dawn pattern)
            const formdata = {
                updates: {
                    [lineItem.key]: 0
                },
                sections: cart && cart.getSectionsToRender ? 
                         cart.getSectionsToRender().map((section) => section.id) : [],
                sections_url: window.location.pathname
            };

            const response = await fetch('/cart/update.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formdata)
            });
            
            const responseData = await response.json();

            if (responseData.status) {
                // Error occurred
                console.error('Error removing threshold product:', responseData.description);
                return;
            }

            // Success - publish update event
            this.publishCartUpdate(responseData);

            // Render cart contents if cart drawer exists
            if (cart && typeof cart.renderContents === 'function') {
                cart.renderContents(responseData);
            }
            
            console.log(`✅ Removed threshold product ${productId} using key ${lineItem.key}`);
            
            // NEW: Remove from tracked products
            this.addedThresholdProducts.delete(productId);
            
            // FIXED: Invalidate cache after successful remove
            this.cachedCartData = null;
            
        } catch (error) {
            console.error(`❌ Failed to remove threshold product ${productId}:`, error);
            throw error;
        } finally {
            // FIXED: Remove from processing set after delay
            setTimeout(() => {
                this.processingProductIds.delete(productId);
            }, 2000);
        }
    }

    // NEW: Correct threshold product quantity to 1 if it exceeds
    async correctThresholdProductQuantity(productId, lineItem) {
        if (this.processingProductIds.has(productId)) {
            console.log(`Already processing product ${productId}, skipping quantity correction`);
            return;
        }

        this.processingProductIds.add(productId);

        try {
            if (!lineItem) {
                console.log(`No line item provided for ${productId}, skipping quantity correction`);
                return;
            }

            // If quantity is more than 1, set it to 1
            if (lineItem.quantity <= 1) {
                console.log(`Product ${productId} quantity is already 1, no correction needed`);
                return;
            }

            const cart = this.getCartDrawer();

            // Build request body with sections (Dawn pattern)
            const formdata = {
                updates: {
                    [lineItem.key]: 1
                },
                sections: cart && cart.getSectionsToRender ? 
                         cart.getSectionsToRender().map((section) => section.id) : [],
                sections_url: window.location.pathname
            };

            const response = await fetch('/cart/update.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formdata)
            });
            
            const responseData = await response.json();

            if (responseData.status) {
                // Error occurred
                console.error('Error correcting threshold product quantity:', responseData.description);
                return;
            }

            // Success - publish update event
            this.publishCartUpdate(responseData);

            // Render cart contents if cart drawer exists
            if (cart && typeof cart.renderContents === 'function') {
                cart.renderContents(responseData);
            }
            
            console.log(`✅ Corrected threshold product ${productId} quantity from ${lineItem.quantity} to 1`);
            
            // Invalidate cache after successful update
            this.cachedCartData = null;
            
        } catch (error) {
            console.error(`❌ Failed to correct threshold product ${productId} quantity:`, error);
            throw error;
        } finally {
            setTimeout(() => {
                this.processingProductIds.delete(productId);
            }, 2000);
        }
    }

    async syncWithCart() {
        try {
            // FIXED: Wait a bit before syncing to let other operations complete
            await new Promise(resolve => setTimeout(resolve, 300));
            
            const cartData = await this.getCartData(true);
            if (cartData) {
                const totalDollars = cartData.total_price;
                console.log(`Syncing cart: ${this.current} -> ${totalDollars}`);
                this.current = totalDollars;
            }
        } catch (error) {
            console.error('Failed to sync with cart:', error);
        }
    }
}

customElements.define('custom-cart-progressbar', CustomCartProgressbar);