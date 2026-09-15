--[[
  A JSON encoder, because the game does not have one.

  Encoding only: nothing here ever reads JSON back. Small enough to audit at a
  glance, which matters for something that writes the string the website trusts.
]]

local _, ns = ...

local json = {}
ns.json = json

local ESCAPES = {
  ['"'] = '\\"',
  ['\\'] = '\\\\',
  ['\b'] = '\\b',
  ['\f'] = '\\f',
  ['\n'] = '\\n',
  ['\r'] = '\\r',
  ['\t'] = '\\t',
}

local function escapeChar(c)
  return ESCAPES[c] or string.format('\\u%04x', string.byte(c))
end

local function encodeString(value)
  -- Control characters, backslashes and quotes are the only ones that must go.
  return '"' .. string.gsub(value, '[%z\1-\31\\"]', escapeChar) .. '"'
end

local function encodeNumber(value)
  if value ~= value then return 'null' end -- not a number
  if value == math.huge or value == -math.huge then return 'null' end
  if value == math.floor(value) and math.abs(value) < 1e15 then
    return string.format('%d', value)
  end
  -- Trim the trailing zeroes a fixed format leaves behind.
  local text = string.format('%.4f', value)
  text = string.gsub(text, '0+$', '')
  text = string.gsub(text, '%.$', '')
  return text
end

--[[ A table counts as an array when every key is a number from one upwards, or
     when it was made by json.array and is simply empty. ]]
local function isArray(value)
  if rawget(value, '__array') then return true end
  if next(value) == nil then return false end
  local count = 0
  for key in pairs(value) do
    if type(key) ~= 'number' then return false end
    count = count + 1
  end
  return count == #value
end

--- An empty table that still encodes as [] rather than {}.
function json.array(t)
  t = t or {}
  t.__array = true
  return t
end

local encodeValue

local function encodeTable(value, out)
  if isArray(value) then
    out[#out + 1] = '['
    for i = 1, #value do
      if i > 1 then out[#out + 1] = ',' end
      encodeValue(value[i], out)
    end
    out[#out + 1] = ']'
    return
  end

  out[#out + 1] = '{'
  local first = true
  for key, item in pairs(value) do
    -- Keys beginning with two underscores are markers, not data.
    if type(key) == 'string' and string.sub(key, 1, 2) ~= '__' then
      if not first then out[#out + 1] = ',' end
      first = false
      out[#out + 1] = encodeString(key)
      out[#out + 1] = ':'
      encodeValue(item, out)
    end
  end
  out[#out + 1] = '}'
end

encodeValue = function(value, out)
  local kind = type(value)
  if value == nil or kind == 'function' or kind == 'userdata' then
    out[#out + 1] = 'null'
  elseif kind == 'boolean' then
    out[#out + 1] = value and 'true' or 'false'
  elseif kind == 'number' then
    out[#out + 1] = encodeNumber(value)
  elseif kind == 'string' then
    out[#out + 1] = encodeString(value)
  elseif kind == 'table' then
    encodeTable(value, out)
  else
    out[#out + 1] = 'null'
  end
end

function json.encode(value)
  local out = {}
  encodeValue(value, out)
  return table.concat(out)
end
