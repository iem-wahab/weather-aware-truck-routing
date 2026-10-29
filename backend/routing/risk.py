LEVELS = ('Low', 'Moderate', 'High', 'Severe', 'No Travel')


def wind_risk(value, load_lb):
    if value is None:
        return None
    if value >= 55 or (value >= 45 and load_lb > 30000):
        return 'No Travel'
    if value >= 45 or (value >= 35 and load_lb > 40000):
        return 'Severe'
    if value >= 35:
        return 'High'
    if value >= 25:
        return 'Moderate'
    return 'Low'


def rain_risk(value):
    if value is None:
        return None
    if value > 1:
        return 'No Travel'
    if value >= .5:
        return 'Severe'
    if value >= .25:
        return 'High'
    if value >= .1:
        return 'Moderate'
    return 'Low'


def snow_risk(value):
    if value is None:
        return None
    if value > 3:
        return 'No Travel'
    if value >= 2:
        return 'Severe'
    if value >= 1:
        return 'High'
    if value >= .5:
        return 'Moderate'
    return 'Low'


def classify(wind, rain, snow, load_lb):
    parts = {'Wind': wind_risk(wind, load_lb), 'Rain': rain_risk(rain), 'Snow': snow_risk(snow)}
    if any(value is None for value in parts.values()):
        return {'risk': None, 'condition': 'Weather forecast unavailable'}
    condition = max(parts, key=lambda key: LEVELS.index(parts[key]))
    if condition == 'Wind' and wind is not None:
        if wind >= 45 and load_lb > 30000 and wind < 55:
            condition = 'Wind with load over 30,000 lb'
        elif wind >= 35 and load_lb > 40000 and wind < 45:
            condition = 'Wind with load over 40,000 lb'
    return {'risk': max(parts.values(), key=LEVELS.index), 'condition': condition}
