export default function (handle) {
    const overlay = document.querySelector('#dark_overlay');

    function hide_window() {
        overlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    // Click anywhere to hide float window
    overlay.addEventListener('click', () => {
        hide_window();
    });
    // Prevent hiding when click on main frame
    overlay.querySelector('#main_float').addEventListener('click', (event) => {
        event.stopPropagation();
    });
    // Click the close button to hide float window
    overlay.querySelector('.close').addEventListener('click', () => {
        hide_window();
    });

    // Float window can also be hide by pressing escape button
    document.addEventListener('keyup', (event) => {
        if (event.key == 'Escape') {
            hide_window();
        }
    });

    // Click the float_window_trigger class button to show float window
    document.querySelectorAll('.float_window_trigger').forEach((btn) => {
        btn.addEventListener('click', function (event) {
            event.preventDefault();
            overlay.style.display = 'block';
            document.body.style.overflow = 'hidden';

            handle.call(this, overlay.querySelector('#main_float'));
        });
    });
}
