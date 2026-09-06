// TypeScript標準のlib.dom.d.tsにまだ完全には含まれていない実験的なブラウザAPI
// (File System Access APIの権限メソッド、WebHID)の最小限の型宣言。
export {};

declare global {
  // --- File System Access API ---
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }

  interface FileSystemHandle {
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    isSameEntry(other: FileSystemHandle): Promise<boolean>;
  }

  interface DirectoryPickerOptions {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: string;
  }

  interface Window {
    showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
  }

  // --- WebHID ---
  interface HIDDeviceFilter {
    vendorId?: number;
    productId?: number;
    usagePage?: number;
    usage?: number;
  }

  interface HIDDeviceRequestOptions {
    filters: HIDDeviceFilter[];
  }

  interface HIDCollectionInfo {
    usagePage: number;
    usage: number;
  }

  interface HIDInputReportEvent extends Event {
    readonly device: HIDDevice;
    readonly reportId: number;
    readonly data: DataView;
  }

  interface HIDDevice extends EventTarget {
    readonly vendorId: number;
    readonly productId: number;
    readonly collections: HIDCollectionInfo[];
    readonly opened: boolean;
    oninputreport: ((this: HIDDevice, ev: HIDInputReportEvent) => void) | null;
    open(): Promise<void>;
    close(): Promise<void>;
  }

  interface HID extends EventTarget {
    requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
    getDevices(): Promise<HIDDevice[]>;
  }

  interface Navigator {
    readonly hid: HID;
  }
}
