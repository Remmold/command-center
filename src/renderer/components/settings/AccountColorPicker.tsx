import { useMenu } from '../../hooks/useMenu'
import { ACCOUNT_COLORS, useAccountColorsStore } from '../../state/accountColors'
import { useAccountColor } from '../../state/useAccountColor'
import { AccentDot } from '../ui/AccentDot'
import { Button } from '../ui/Button'
import { Popover, PopoverHeading, PopoverSection } from '../ui/Popover'
import { Swatch, SwatchGrid } from '../ui/SwatchGrid'
import { accentFill } from '../ui/accountAccent'

/** Picks an account's accent colour. */
export function AccountColorPicker({ profileId, name }: { profileId: string; name: string }) {
  const menu = useMenu()
  const color = useAccountColor(profileId)
  const pick = useAccountColorsStore((s) => s.pick)
  return (
    <>
      <Button ref={menu.setAnchor} variant="ghost" pressed={menu.open} onClick={menu.toggle} label={`Colour for ${name}`} tooltip={`The colour ${name} shows with everywhere`}>
        <AccentDot color={color} size="md" />
        Colour
      </Button>
      <Popover open={menu.open} onClose={menu.close} anchor={menu.anchor} align="end" width={200} label={`Colour for ${name}`}>
        <PopoverHeading title="Account colour" hint={name} />
        <PopoverSection>
          <SwatchGrid label={`Colours for ${name}`}>
            {ACCOUNT_COLORS.map((c) => (
              <Swatch
                key={c}
                label={c}
                selected={c === color}
                fill={accentFill(c)}
                onClick={() => {
                  pick(profileId, c)
                  menu.close()
                }}
              />
            ))}
          </SwatchGrid>
        </PopoverSection>
      </Popover>
    </>
  )
}
