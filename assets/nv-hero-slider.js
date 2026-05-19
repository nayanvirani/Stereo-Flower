if (!customElements.get('nv-hero-slider')) {
  customElements.define(
    'nv-hero-slider',
    class HeroSlider extends HTMLElement {
      constructor() {
        super();
        this.init();
      }
      init(){
        this.swiper = new Swiper(this.querySelector('.swiper'), {
            slidesPerView: 1,
            loop: true,
            navigation: {
                nextEl: this.querySelector(".nv-hero-button-next"),
                prevEl: this.querySelector(".nv-hero-button-prev"),
            },
        });
      }
    }
  );
}
