# ha_health_record — HA Services 設計

## 決策記錄

| 項目 | 決策 |
|------|------|
| 範圍 | A — 12 個 WebSocket 命令全部 1:1 對應成 HA services |
| 命名 | A — 扁平式，跟 WS 命名一致 |
| 回傳 | B — 查詢類 `SupportsResponse.ONLY`，寫入類 `SupportsResponse.OPTIONAL` |

## 服務清單

### 查詢類（SupportsResponse.ONLY）

| 服務名稱 | 對應 WS 命令 | 說明 |
|----------|-------------|------|
| `ha_health_record.get_members` | `ha_health_record/get_members` | 列出所有成員及其紀錄類型 |
| `ha_health_record.get_records` | `ha_health_record/get_records` | 查詢時間範圍內的紀錄 |
| `ha_health_record.export_csv` | `ha_health_record/export_csv` | 匯出成員紀錄為 CSV |

### 寫入類（SupportsResponse.OPTIONAL）

| 服務名稱 | 對應 WS 命令 | 說明 |
|----------|-------------|------|
| `ha_health_record.log_record` | `ha_health_record/log_record` | 新增一筆健康紀錄 |
| `ha_health_record.update_record` | `ha_health_record/update_record` | 更新既有紀錄 |
| `ha_health_record.delete_record` | `ha_health_record/delete_record` | 刪除一筆紀錄 |
| `ha_health_record.add_record_type` | `ha_health_record/add_record_type` | 新增紀錄類型 |
| `ha_health_record.update_record_type` | `ha_health_record/update_record_type` | 更新紀錄類型設定 |
| `ha_health_record.delete_record_type` | `ha_health_record/delete_record_type` | 刪除紀錄類型 |
| `ha_health_record.add_member` | `ha_health_record/add_member` | 新增家庭成員 |
| `ha_health_record.update_member` | `ha_health_record/update_member` | 更新成員資料 |
| `ha_health_record.delete_member` | `ha_health_record/delete_member` | 刪除成員 |

## 實作架構

### 新增檔案

1. **`services.yaml`** — 12 個服務的 schema 定義（fields、selectors、descriptions）
2. **`services.py`** — 12 個 service handler 函式 + 註冊邏輯

### 修改檔案

3. **`__init__.py`** — 在 `async_setup_entry()` 中呼叫 `async_register_services(hass)`（只註冊一次）；在 `async_unload_entry()` 中當最後一個 entry 卸載時呼叫 `hass.services.async_remove()`

### 技術細節

**Import pattern:**
```python
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
)
```

**Service registration pattern:**
```python
# services.py
async def async_register_services(hass: HomeAssistant) -> None:
    # 查詢類 — ONLY
    hass.services.async_register(
        DOMAIN, "get_members", handle_get_members,
        schema=SCHEMA_GET_MEMBERS,
        supports_response=SupportsResponse.ONLY,
    )
    # 寫入類 — OPTIONAL
    hass.services.async_register(
        DOMAIN, "log_record", handle_log_record,
        schema=SCHEMA_LOG_RECORD,
        supports_response=SupportsResponse.OPTIONAL,
    )
```

**Handler pattern:**
```python
async def handle_get_members(call: ServiceCall) -> ServiceResponse:
    coordinators = _get_all_coordinators(call.hass)
    members = []
    for coord in coordinators:
        members.append({...})
    return {"members": members}
```

**Coordinator lookup:**
```python
def _get_all_coordinators(hass: HomeAssistant) -> list[HealthRecordCoordinator]:
    coord_map = hass.data.get(KEY_COORDINATOR_MAP, {})
    return list(coord_map.values())

def _get_coordinator(hass: HomeAssistant, member_id: str) -> HealthRecordCoordinator:
    coord_map = hass.data.get(KEY_COORDINATOR_MAP, {})
    coord = coord_map.get(member_id)
    if coord is None:
        raise ServiceValidationError(
            f"Member '{member_id}' not found",
            translation_domain=DOMAIN,
            translation_key="member_not_found",
        )
    return coord
```

## services.yaml 欄位定義

### get_members
```yaml
get_members:
  # 無參數
```

### get_records
```yaml
get_records:
  fields:
    start_time:
      required: true
      selector:
        datetime:
    end_time:
      required: true
      selector:
        datetime:
```

### export_csv
```yaml
export_csv:
  fields:
    member_id:
      required: true
      selector:
        text:
```

### log_record
```yaml
log_record:
  fields:
    member_id:
      required: true
      selector:
        text:
    record_type:
      required: true
      selector:
        text:
    value:
      required: true
      selector:
        number:
          mode: box
          step: 0.1
    note:
      selector:
        text:
    timestamp:
      selector:
        datetime:
```

### update_record
```yaml
update_record:
  fields:
    member_id:
      required: true
      selector:
        text:
    type_id:
      required: true
      selector:
        text:
    timestamp:
      required: true
      selector:
        text:
    record_id:
      selector:
        text:
    value:
      selector:
        number:
          mode: box
          step: 0.1
    note:
      selector:
        text:
    new_timestamp:
      selector:
        datetime:
```

### delete_record
```yaml
delete_record:
  fields:
    member_id:
      required: true
      selector:
        text:
    type_id:
      required: true
      selector:
        text:
    timestamp:
      required: true
      selector:
        text:
    record_id:
      selector:
        text:
```

### add_record_type
```yaml
add_record_type:
  fields:
    member_id:
      required: true
      selector:
        text:
    name:
      required: true
      selector:
        text:
    unit:
      required: true
      selector:
        text:
    default_value:
      selector:
        number:
          mode: box
          step: 0.1
    default_value_mode:
      selector:
        select:
          options:
            - "fixed"
            - "last_value"
```

### update_record_type
```yaml
update_record_type:
  fields:
    member_id:
      required: true
      selector:
        text:
    type_id:
      required: true
      selector:
        text:
    name:
      required: true
      selector:
        text:
    unit:
      required: true
      selector:
        text:
    default_value:
      selector:
        number:
          mode: box
          step: 0.1
    default_value_mode:
      selector:
        select:
          options:
            - "fixed"
            - "last_value"
```

### delete_record_type
```yaml
delete_record_type:
  fields:
    member_id:
      required: true
      selector:
        text:
    type_id:
      required: true
      selector:
        text:
```

### add_member
```yaml
add_member:
  fields:
    name:
      required: true
      selector:
        text:
    member_id:
      selector:
        text:
    note:
      selector:
        text:
```

### update_member
```yaml
update_member:
  fields:
    member_id:
      required: true
      selector:
        text:
    name:
      required: true
      selector:
        text:
    note:
      selector:
        text:
```

### delete_member
```yaml
delete_member:
  fields:
    member_id:
      required: true
      selector:
        text:
```
