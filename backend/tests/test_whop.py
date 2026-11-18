from __future__ import annotations

import pytest

from app.whop import calc_payouts, split_bps_for, split_for


def test_locked_split_rules() -> None:
    assert split_for(True) == (0.60, 0.40)
    assert split_for(False) == (0.50, 0.50)
    assert split_bps_for(True) == (6000, 4000)
    assert split_bps_for(False) == (5000, 5000)


def test_first_product_payout_math() -> None:
    payout = calc_payouts(1_000, True)
    assert payout["creator_share"] == 0.60
    assert payout["platform_share"] == 0.40
    assert payout["creator_cents"] == 600
    assert payout["platform_cents"] == 400

    payout = calc_payouts(999, True)
    assert payout["creator_cents"] == 599  # 599.4 rounds down
    assert payout["platform_cents"] == 400
    assert payout["net_cents"] == 999


def test_subsequent_product_payout_math_is_half_up() -> None:
    payout = calc_payouts(1_001, False)
    assert payout["creator_cents"] == 501
    assert payout["platform_cents"] == 500
    assert payout["creator_cents"] + payout["platform_cents"] == 1_001


def test_refund_recalculates_both_sides() -> None:
    payout = calc_payouts(1_000, True, refunded_cents=100)
    assert payout["net_cents"] == 900
    assert payout["creator_cents"] == 540
    assert payout["platform_cents"] == 360


@pytest.mark.parametrize("gross", [0, 1, 7, 99, 100, 1_001, 9_999, 250_000])
def test_split_always_sums_to_net(gross: int) -> None:
    for is_first in (True, False):
        payout = calc_payouts(gross, is_first)
        assert payout["creator_cents"] + payout["platform_cents"] == payout["net_cents"] == gross


def test_invalid_payout_inputs_fail_closed() -> None:
    with pytest.raises(ValueError):
        calc_payouts(100, True, refunded_cents=101)
    with pytest.raises(ValueError):
        calc_payouts(-1, True)
    with pytest.raises(TypeError):
        calc_payouts(100.5, True)  # type: ignore[arg-type]
