if (!customElements.get('nv-transform-grid-slider')) {
  customElements.define(
    'nv-transform-grid-slider',
    class TransformGridSllider extends HTMLElement {
      constructor() {
        super();
        this.init();
      }
      init(){
        this.swiper = new Swiper(this.querySelector('.swiper'), {
            slidesPerView: this.dataset.mobile,
            loop: false,
            spaceBetween: this.dataset.space,
            pagination: {
                el: this.querySelector(".swiper-pagination"),
                clickable: true
            },
            breakpoints: {
                768: {
                    slidesPerView: this.dataset.tablet,
                    spaceBetween: this.dataset.space
                },
                1024: {
                    slidesPerView: this.dataset.desktop,
                    spaceBetween: this.dataset.space
                }
            }
        });
      }
    }
  );
}
