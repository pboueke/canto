![canto](./android/app/src/main/assets/images/logo_t_v1_256.png)

Free and open source diary and journaling app

---

&nbsp;

# Build

## Android

### mmkv-storage

This project uses [react-native-mmkv-storage](https://github.com/ammarahm-ed/react-native-mmkv-storage). If the your project wont build after following the [installation instrunctions](https://rnmmkv.vercel.app/#/gettingstarted), you may need to follow these steps:

1. In the Android Studio SDK Manager, install CMake 3.10 and make sure it is the only version available. 

2. In the Android Studio Manager, install NDK 21.4.7075529 and make sure it is the only version available. 

3. Delete and reinstall node_modules

4. Enter `node_modules/react-native-mmkv-storage/android/build.gradle` and make sure that the CMake version above is specified at `externalNativeBuild`. Like so:

```
externalNativeBuild {
    cmake {
        path "./src/main/rnmkv/CMakeLists.txt"
        version "3.10.2"
    }
}
```

5. Clean your project with `./gradlew clean`

6. In Android Studio, run **Build** -> **Refresh Linked C++ Projects**

These steps may not all be required, but they also may not be enough. [Related discussion](https://github.com/ammarahm-ed/react-native-mmkv-storage/issues/67#issuecomment-801467636).

