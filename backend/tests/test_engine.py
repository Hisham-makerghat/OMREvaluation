"""The per-scan grid fit that puts bubble windows on the circles a particular print run drew."""
import numpy as np

from omr.engine import fit_grid_axis


def ink_profile_for_circles(centres, length=1000, radius=12):
    """Darkness along one axis of a row of printed circles, summed across the other axis:
    a band of ink the width of the circle (its outline and the letter inside), darker at
    the two edges where the outline runs along the axis."""
    profile = np.zeros(length, np.float32)
    for c in centres:
        lo, hi = int(c - radius), int(c + radius) + 1
        profile[max(lo, 0):hi] += 30
        profile[max(lo, 0):lo + 3] += 25
        profile[hi - 3:hi] += 25
    return profile


def test_finds_a_grid_that_is_shifted_and_stretched():
    # The first circle is cut off by the image edge, as on a tightly scanned sheet.
    true_start, true_pitch, count = 7.0, 33.6, 30
    profile = ink_profile_for_circles([true_start + i * true_pitch for i in range(count)])
    start, pitch = fit_grid_axis(profile, start=17.5, pitch=33.0, count=count, circle_radius=10)
    assert abs(start - true_start) <= 2.0        # a 25 px bubble window forgives this
    assert abs(pitch - true_pitch) <= 0.15


def test_keeps_a_grid_that_already_matches():
    profile = ink_profile_for_circles([17.5 + i * 33.0 for i in range(30)])
    start, pitch = fit_grid_axis(profile, start=17.5, pitch=33.0, count=30, circle_radius=10)
    assert abs(start - 17.5) <= 1.0
    assert abs(pitch - 33.0) <= 0.15


def test_filled_bubbles_do_not_pull_the_grid():
    centres = [17.5 + i * 33.0 for i in range(30)]
    profile = ink_profile_for_circles(centres)
    for c in (centres[3], centres[12]):       # two solid discs, as a student would fill
        profile[int(c) - 11:int(c) + 12] += 200
    start, pitch = fit_grid_axis(profile, start=17.5, pitch=33.0, count=30, circle_radius=10)
    assert abs(start - 17.5) <= 1.0
    assert abs(pitch - 33.0) <= 0.15
