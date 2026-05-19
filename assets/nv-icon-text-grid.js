if (!customElements.get('nv-icon-text-grid')) {
      customElements.define(
        'nv-icon-text-grid',
        class IconTextGridSlider extends HTMLElement {
          constructor() {
            super();
            this.swiper = null;
            this.init();
          }
          
          init() {
            const desktopSlider = this.dataset.desktopslider === 'true';
            const mobileSlider = this.dataset.mobileslider === 'true';
            
            // If neither slider is enabled, don't initialize
            if (!desktopSlider && !mobileSlider) {
              return;
            }
            
            // Handle responsive slider initialization/destruction
            this.handleResponsiveSlider(desktopSlider, mobileSlider);
            
            // Listen for viewport changes
            const mediaQuery = window.matchMedia('(min-width: 1024px)');
            mediaQuery.addEventListener('change', () => {
              this.handleResponsiveSlider(desktopSlider, mobileSlider);
            });
          }
          
          handleResponsiveSlider(desktopSlider, mobileSlider) {
            const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
            const shouldInitialize = (isDesktop && desktopSlider) || (!isDesktop && mobileSlider);
            
            if (shouldInitialize && !this.swiper) {
              // Initialize Swiper
              this.initSwiper();
            } else if (!shouldInitialize && this.swiper) {
              // Destroy Swiper
              this.destroySwiper();
            }
          }
          
          initSwiper() {
            this.swiper = new Swiper(this.querySelector('.swiper'), {
              slidesPerView: this.dataset.mobile,
              loop: false,
              spaceBetween: 45,
              pagination: {
                el: this.querySelector(".swiper-pagination"),
                clickable: true
              },
              breakpoints: {
                768: {
                  slidesPerView: this.dataset.tablet,
                  spaceBetween: 45
                },
                1024: {
                  slidesPerView: this.dataset.desktop,
                  spaceBetween: 45
                }
              }
            });
          }
          
          destroySwiper() {
            if (this.swiper) {
              this.swiper.destroy(true, true);
              this.swiper = null;
            }
          }
        }
      );
    }