"""Expected rating ("worth watching") of upcoming fights, from public data only.

The model sees what a visitor can already see: the star ratings of each fighter's earlier fights
and the public context of the card (main event, title, division). It never sees a result or any
private feature (finish, duration, pace), so a prediction cannot move because of how a fight
ended, and it says nothing about who wins.
"""
